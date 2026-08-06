import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as PDFKit from "pdfkit";
import {
  AuditAction,
  DocumentType,
  Prisma,
  Quotation,
  QuotationStatus,
} from "@prisma/client";
import { existsSync } from "fs";
import { join } from "path";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { EmailService } from "../email/email.service";
import { SettingsService } from "../settings/settings.service";
import { CreateQuotationDto } from "./dto/create-quotation.dto";
import { QueryQuotationsDto } from "./dto/query-quotations.dto";
import { UpdateQuotationDto } from "./dto/update-quotation.dto";

type BuiltQuotationItem = {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
};

type ProductForQuote = {
  id: string;
  name: string;
  description: string | null;
  sellingPrice: Prisma.Decimal;
  unit: string;
  category: { name: string } | null;
};

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: DataAccessService,
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
  ) {}

  private async logQuotationEmailFailure(
    quotation: Awaited<ReturnType<QuotationsService["findOne"]>>,
    errorMessage: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.SENT,
        resourceType: "QUOTATION_EMAIL",
        resourceId: quotation.id,
        message: `FAILED: Quotation ${quotation.quotationNumber} email failed (${errorMessage})`,
        metadata: {
          status: "FAILED",
          quotationNumber: quotation.quotationNumber,
          recipient: quotation.customer.email,
          error: errorMessage,
        },
      },
    });
  }

  private async sendQuotationEmail(quotationId: string) {
    const quotation = await this.findOne(quotationId);
    if (!quotation.customer.email) {
      throw new BadRequestException(
        "Customer email is required before sending quotation",
      );
    }

    const tenant = await this.settingsService.getTenantConfiguration();
    const { buffer, filename } = await this.generatePdf(quotationId);
    const subject = `Quotation ${quotation.quotationNumber} from ${tenant.companyName}`;
    const body = [
      `Dear ${quotation.customer.contactPerson ?? quotation.customer.companyName},`,
      "",
      `Please find attached quotation ${quotation.quotationNumber}.`,
      "",
      `Total: ${quotation.currency} ${Number(quotation.totalAmount).toFixed(2)}`,
      "",
      "Regards,",
      tenant.companyName,
    ].join("\n");

    await this.emailService.sendMail({
      to: quotation.customer.email,
      subject,
      text: body,
      attachments: [
        {
          filename,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });

    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.SENT,
        resourceType: "QUOTATION_EMAIL",
        resourceId: quotation.id,
        message: `SUCCESS: Quotation ${quotation.quotationNumber} emailed to ${quotation.customer.email}`,
        metadata: {
          status: "SUCCESS",
          quotationNumber: quotation.quotationNumber,
          recipient: quotation.customer.email,
          subject,
        },
      },
    });
  }

  async resendEmail(id: string) {
    const quotation = await this.findOne(id);
    try {
      await this.sendQuotationEmail(id);
      return {
        message: `Quotation ${quotation.quotationNumber} emailed successfully`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send quotation";
      await this.logQuotationEmailFailure(quotation, errorMessage);
      throw new BadRequestException(errorMessage);
    }
  }

  private async ensureSystemUserId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const email = "system@sales.local";
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      return existing.id;
    }

    const created = await tx.user.create({
      data: {
        email,
        passwordHash: "SYSTEM_ACCOUNT",
        firstName: "System",
        lastName: "User",
      },
    });
    return created.id;
  }

  private async generateDocumentNumber(
    tx: Prisma.TransactionClient,
    documentType: DocumentType,
    prefix: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await tx.documentSequence.upsert({
      where: {
        uq_document_sequences_type_year: {
          documentType,
          year,
        },
      },
      update: {
        lastNumber: { increment: 1 },
      },
      create: {
        documentType,
        year,
        prefix,
        lastNumber: 1,
      },
    });

    return `${prefix}-${year}-${sequence.lastNumber.toString().padStart(6, "0")}`;
  }

  private async generateQuotationNumber(
    tx: Prisma.TransactionClient,
    startFrom: number,
  ): Promise<string> {
    let sequence = await tx.documentSequence.upsert({
      where: {
        uq_document_sequences_type_year: {
          documentType: DocumentType.QUOTATION,
          year: 0,
        },
      },
      update: {
        lastNumber: { increment: 1 },
      },
      create: {
        documentType: DocumentType.QUOTATION,
        year: 0,
        prefix: "NUM",
        lastNumber: startFrom,
      },
    });

    let candidate = String(sequence.lastNumber);
    let existing = await tx.quotation.findUnique({
      where: { quotationNumber: candidate },
      select: { id: true },
    });

    while (existing) {
      sequence = await tx.documentSequence.update({
        where: {
          uq_document_sequences_type_year: {
            documentType: DocumentType.QUOTATION,
            year: 0,
          },
        },
        data: { lastNumber: { increment: 1 } },
      });
      candidate = String(sequence.lastNumber);
      existing = await tx.quotation.findUnique({
        where: { quotationNumber: candidate },
        select: { id: true },
      });
    }

    return candidate;
  }

  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    let sequence = await tx.documentSequence.upsert({
      where: {
        uq_document_sequences_type_year: {
          documentType: DocumentType.TAX_INVOICE,
          year: 0,
        },
      },
      update: {
        lastNumber: { increment: 1 },
      },
      create: {
        documentType: DocumentType.TAX_INVOICE,
        year: 0,
        prefix: "NUM",
        lastNumber: DEFAULTS.invoiceNumberStart,
      },
    });

    let candidate = String(sequence.lastNumber);
    let existing = await tx.taxInvoice.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });

    while (existing) {
      sequence = await tx.documentSequence.update({
        where: {
          uq_document_sequences_type_year: {
            documentType: DocumentType.TAX_INVOICE,
            year: 0,
          },
        },
        data: { lastNumber: { increment: 1 } },
      });
      candidate = String(sequence.lastNumber);
      existing = await tx.taxInvoice.findUnique({
        where: { invoiceNumber: candidate },
        select: { id: true },
      });
    }

    return candidate;
  }

  async configureNumberingStart(startFrom: number) {
    return this.prisma.$transaction(async (tx) => {
      let candidate = startFrom;
      let existing = await tx.quotation.findUnique({
        where: { quotationNumber: String(candidate) },
        select: { id: true },
      });

      while (existing) {
        candidate += 1;
        existing = await tx.quotation.findUnique({
          where: { quotationNumber: String(candidate) },
          select: { id: true },
        });
      }

      const sequence = await tx.documentSequence.findUnique({
        where: {
          uq_document_sequences_type_year: {
            documentType: DocumentType.QUOTATION,
            year: 0,
          },
        },
      });

      if (sequence && sequence.lastNumber >= candidate) {
        throw new BadRequestException(
          `Quotation number already at ${sequence.lastNumber}. Use a value above it.`,
        );
      }

      const nextLastNumber = candidate - 1;

      await tx.documentSequence.upsert({
        where: {
          uq_document_sequences_type_year: {
            documentType: DocumentType.QUOTATION,
            year: 0,
          },
        },
        update: {
          lastNumber: nextLastNumber,
          prefix: "NUM",
        },
        create: {
          documentType: DocumentType.QUOTATION,
          year: 0,
          prefix: "NUM",
          lastNumber: nextLastNumber,
        },
      });

      return { nextQuotationNumber: String(candidate) };
    });
  }

  private async buildItems(
    tx: Prisma.TransactionClient,
    items: CreateQuotationDto["items"],
    defaultTaxPercent: number,
  ) {
    const builtItems: BuiltQuotationItem[] = [];
    let subtotal = 0;
    const discountAmount = 0;

    for (const item of items) {
      const hasProductId = Boolean(item.productId);
      const product = hasProductId
        ? await tx.product.findFirst({
            where: { id: item.productId, isActive: true, deletedAt: null },
            include: {
              category: {
                select: {
                  name: true,
                },
              },
            },
          })
        : await this.ensureManualServiceProduct(tx);

      if (!product) {
        if (hasProductId) {
          throw new NotFoundException(
            `Product with id ${item.productId} not found`,
          );
        }
        throw new BadRequestException("Unable to resolve manual service item");
      }

      const isService = !hasProductId || this.isServiceProduct(product);
      const quantity = isService ? 1 : item.quantity;
      if (!quantity || quantity <= 0) {
        throw new BadRequestException(
          "Quantity is required and must be greater than zero for non-service items",
        );
      }

      const unitPrice = item.unitPrice ?? Number(product.sellingPrice);
      if (unitPrice < 0) {
        throw new BadRequestException("Unit price cannot be negative");
      }

      if (!hasProductId && !item.description?.trim()) {
        throw new BadRequestException(
          "Description is required when no predefined product is selected",
        );
      }
      if (!hasProductId && unitPrice <= 0) {
        throw new BadRequestException(
          "Unit price is required for manual service items",
        );
      }

      const lineSubtotal = quantity * unitPrice;
      const lineDiscount = 0;
      const lineTaxPercent = 0;
      const lineTaxAmount = 0;
      const lineTotal = lineSubtotal;

      subtotal += lineSubtotal;

      builtItems.push({
        productId: product.id,
        description:
          item.description?.trim() || product.description || undefined,
        quantity,
        unitPrice,
        discountAmount: lineDiscount,
        taxPercent: lineTaxPercent,
        taxAmount: lineTaxAmount,
        lineTotal,
      });
    }

    const taxAmount = (subtotal * defaultTaxPercent) / 100;

    return {
      items: builtItems,
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount: subtotal + taxAmount,
    };
  }

  private isServiceProduct(product: ProductForQuote): boolean {
    const categoryName = product.category?.name?.toLowerCase() ?? "";
    const unit = product.unit.toLowerCase();
    return (
      categoryName.includes("service") ||
      ["service", "job", "task", "repair"].includes(unit)
    );
  }

  private async ensureManualServiceProduct(
    tx: Prisma.TransactionClient,
  ): Promise<ProductForQuote> {
    const category = await tx.productCategory.upsert({
      where: { name: "Services" },
      update: {},
      create: { name: "Services" },
    });

    return tx.product.upsert({
      where: { sku: "SERVICE-MANUAL" },
      update: { isActive: true, deletedAt: null },
      create: {
        sku: "SERVICE-MANUAL",
        name: "Manual Service Item",
        description: "Service line entered manually during quotation creation",
        sellingPrice: 0,
        costPrice: 0,
        stock: 0,
        taxPercent: 0,
        unit: "service",
        isActive: true,
        categoryId: category.id,
      },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  private async getDefaultTaxPercent(): Promise<number> {
    const tenant = await this.settingsService.getTenantConfiguration();
    const parsedTax = Number(tenant.defaultTaxPercent ?? 0);
    return Number.isFinite(parsedTax) && parsedTax > 0 ? parsedTax : 0;
  }

  private buildWhere(query: QueryQuotationsDto): Prisma.QuotationWhereInput {
    const where: Prisma.QuotationWhereInput = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.search) {
      where.OR = [
        { quotationNumber: { contains: query.search, mode: "insensitive" } },
        {
          customer: {
            companyName: { contains: query.search, mode: "insensitive" },
          },
        },
        { notes: { contains: query.search, mode: "insensitive" } },
      ];
    }

    return where;
  }

  async create(dto: CreateQuotationDto): Promise<Quotation> {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, deletedAt: null },
      });
      if (!customer) {
        throw new NotFoundException(
          `Customer with id ${dto.customerId} not found`,
        );
      }

      const createdById = await this.ensureSystemUserId(tx);
      const tenantConfig = await this.settingsService.getTenantConfiguration();
      const configuredStart = Number(
        tenantConfig.quotationNumberStart ?? DEFAULTS.quotationNumberStart,
      );
      const quotationNumber = await this.generateQuotationNumber(
        tx,
        configuredStart > 0 ? configuredStart : DEFAULTS.quotationNumberStart,
      );
      const defaultTaxPercent = await this.getDefaultTaxPercent();
      const summary = await this.buildItems(tx, dto.items, defaultTaxPercent);

      return tx.quotation.create({
        data: {
          quotationNumber,
          customerId: dto.customerId,
          status: dto.status ?? QuotationStatus.DRAFT,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          currency: dto.currency?.trim().toUpperCase() || "KSH",
          subtotal: summary.subtotal,
          discountAmount: summary.discountAmount,
          taxAmount: summary.taxAmount,
          totalAmount: summary.totalAmount,
          notes: dto.notes?.trim(),
          createdById,
          items: {
            create: summary.items,
          },
        },
      });
    });
  }

  async findAll(query: QueryQuotationsDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: {
              id: true,
              companyName: true,
            },
          },
          items: true,
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    if (!quotation) {
      throw new NotFoundException(`Quotation with id ${id} not found`);
    }
    return quotation;
  }

  async update(id: string, dto: UpdateQuotationDto) {
    const existing = await this.findOne(id);
    if (existing.status === QuotationStatus.ACCEPTED) {
      throw new BadRequestException("Accepted quotations cannot be edited");
    }

    return this.prisma.$transaction(async (tx) => {
      let summary:
        | {
            items: BuiltQuotationItem[];
            subtotal: number;
            taxAmount: number;
            discountAmount: number;
            totalAmount: number;
          }
        | undefined;

      if (dto.items) {
        const defaultTaxPercent = await this.getDefaultTaxPercent();
        summary = await this.buildItems(tx, dto.items, defaultTaxPercent);
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      }

      return tx.quotation.update({
        where: { id },
        data: {
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          expiryDate:
            dto.expiryDate !== undefined
              ? dto.expiryDate
                ? new Date(dto.expiryDate)
                : null
              : undefined,
          currency: dto.currency?.trim().toUpperCase(),
          notes: dto.notes?.trim(),
          status: dto.status,
          subtotal: summary?.subtotal,
          discountAmount: summary?.discountAmount,
          taxAmount: summary?.taxAmount,
          totalAmount: summary?.totalAmount,
          items: summary
            ? {
                create: summary.items,
              }
            : undefined,
        },
      });
    });
  }

  async updateStatus(id: string, status: QuotationStatus) {
    const quotation = await this.findOne(id);
    const validTransitions: Record<QuotationStatus, QuotationStatus[]> = {
      DRAFT: [
        QuotationStatus.SENT,
        QuotationStatus.REJECTED,
        QuotationStatus.EXPIRED,
      ],
      SENT: [
        QuotationStatus.ACCEPTED,
        QuotationStatus.REJECTED,
        QuotationStatus.EXPIRED,
      ],
      ACCEPTED: [],
      REJECTED: [],
      EXPIRED: [],
    };

    if (!validTransitions[quotation.status].includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${quotation.status} to ${status}`,
      );
    }

    if (status === QuotationStatus.SENT) {
      try {
        await this.sendQuotationEmail(id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send quotation";
        await this.logQuotationEmailFailure(quotation, errorMessage);
        throw new BadRequestException(errorMessage);
      }
    }

    return this.prisma.quotation.update({
      where: { id },
      data: {
        status,
        acceptedAt: status === QuotationStatus.ACCEPTED ? new Date() : null,
      },
    });
  }

  async convertToProforma(id: string) {
    const quotation = await this.findOne(id);
    if (quotation.status !== QuotationStatus.ACCEPTED) {
      throw new BadRequestException(
        "Only accepted quotations can be converted",
      );
    }
    const tenant = await this.settingsService.getTenantConfiguration();
    if (tenant.skipProforma) {
      throw new BadRequestException(
        "Workflow is configured to skip Proforma. Convert quotation directly to Invoice.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existingProforma = await tx.proformaInvoice.findFirst({
        where: { quotationId: id, deletedAt: null },
      });
      if (existingProforma) {
        return existingProforma;
      }

      const proformaNumber = await this.generateDocumentNumber(
        tx,
        DocumentType.PROFORMA,
        "PRO",
      );
      const proforma = await tx.proformaInvoice.create({
        data: {
          proformaNumber,
          quotationId: quotation.id,
          customerId: quotation.customerId,
          issueDate: new Date(),
          currency: quotation.currency,
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          taxAmount: quotation.taxAmount,
          totalAmount: quotation.totalAmount,
          notes: quotation.notes,
          createdById: quotation.createdById,
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              description: item.description ?? undefined,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              taxPercent: item.taxPercent,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });

      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          convertedAt: new Date(),
        },
      });

      return proforma;
    });
  }

  async convertToInvoice(id: string) {
    const quotation = await this.findOne(id);
    if (quotation.status !== QuotationStatus.ACCEPTED) {
      throw new BadRequestException(
        "Only accepted quotations can be converted",
      );
    }
    const tenant = await this.settingsService.getTenantConfiguration();
    if (!tenant.skipProforma) {
      throw new BadRequestException(
        "Workflow requires Proforma. Disable Proforma in tenant settings to convert directly.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.taxInvoice.findFirst({
        where: { quotationId: quotation.id, deletedAt: null },
      });
      if (existingInvoice) {
        return existingInvoice;
      }

      const invoiceNumber = await this.generateInvoiceNumber(tx);
      const invoice = await tx.taxInvoice.create({
        data: {
          invoiceNumber,
          quotationId: quotation.id,
          proformaId: null,
          customerId: quotation.customerId,
          issueDate: new Date(),
          currency: quotation.currency,
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          taxAmount: quotation.taxAmount,
          totalAmount: quotation.totalAmount,
          totalPaid: 0,
          balanceDue: quotation.totalAmount,
          notes: quotation.notes,
          createdById: quotation.createdById,
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              description: item.description ?? undefined,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              taxPercent: item.taxPercent,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });

      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          convertedAt: new Date(),
        },
      });

      return invoice;
    });
  }

  async remove(id: string) {
    const quotation = await this.findOne(id);
    if (quotation.status === QuotationStatus.ACCEPTED) {
      throw new BadRequestException("Accepted quotations cannot be deleted");
    }

    return this.prisma.quotation.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const quotation = await this.findOne(id);
    const tenant = await this.settingsService.getTenantConfiguration();
    const filename = `quotation-${quotation.quotationNumber}.pdf`;

    const PDFDocumentCtor =
      (
        PDFKit as unknown as {
          default?: new (options?: {
            margin?: number;
            size?: string;
          }) => PDFKit.PDFDocument;
        }
      ).default ??
      (PDFKit as unknown as new (options?: {
        margin?: number;
        size?: string;
      }) => PDFKit.PDFDocument);

    const doc = new PDFDocumentCtor({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    const bufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const margin = 40;
    const contentWidth = doc.page.width - margin * 2;
    const accent = "#0f172a";
    const muted = "#475569";
    const light = "#e2e8f0";
    const money = (value: number) =>
      `${quotation.currency} ${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    let cursorY = margin;

    doc.rect(margin, cursorY, contentWidth, 62).fill("#f8fafc");
    if (tenant.logoPath) {
      const logoPath = join(process.cwd(), tenant.logoPath);
      if (existsSync(logoPath)) {
        doc.image(logoPath, margin + 10, cursorY + 6, { fit: [80, 50] });
      }
    }
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(tenant.companyName, margin + 100, cursorY + 10, {
        width: 270,
      });
    if (tenant.tagline) {
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(9)
        .text(tenant.tagline, margin + 100, cursorY + 30, { width: 280 });
    }
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("QUOTATION", margin + 390, cursorY + 18, {
        width: contentWidth - 390,
        align: "right",
      });

    cursorY += 78;
    const companyLines = [
      tenant.postalAddress,
      tenant.physicalAddress,
      tenant.city,
      tenant.phone,
      tenant.email,
      tenant.website,
    ].filter((value) => Boolean(value));
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text(companyLines.join(" • "), margin, cursorY, {
        width: contentWidth,
      });

    cursorY += 22;
    doc
      .rect(margin, cursorY, contentWidth, 74)
      .strokeColor(light)
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Quotation Details", margin + 12, cursorY + 10);
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Quotation #: ${quotation.quotationNumber}`,
        margin + 12,
        cursorY + 28,
      )
      .text(
        `Issue Date: ${new Date(quotation.issueDate).toLocaleDateString()}`,
        margin + 12,
        cursorY + 44,
      );
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Billed To", margin + 340, cursorY + 10);
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(quotation.customer.companyName, margin + 340, cursorY + 28, {
        width: 220,
      });
    doc.text(
      quotation.customer.contactPerson ?? "",
      margin + 340,
      cursorY + 42,
      {
        width: 220,
      },
    );
    doc.text(quotation.customer.phone ?? "", margin + 340, cursorY + 56, {
      width: 220,
    });

    cursorY += 94;
    if (quotation.notes) {
      doc
        .fillColor(accent)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(tenant.commentsLabel ?? "Notes", margin, cursorY);
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(10)
        .text(quotation.notes, margin, cursorY + 14, {
          width: contentWidth,
        });
      cursorY = doc.y + 10;
    }

    const tableX = margin;
    const col = {
      no: 30,
      desc: 200,
      qty: 55,
      unit: 80,
      tax: 65,
      total: 85,
    };
    const drawTableHeader = (y: number) => {
      doc.rect(tableX, y, contentWidth, 24).fill("#f1f5f9");
      let x = tableX;
      const headers = [
        { t: "#", w: col.no, a: "left" as const },
        { t: "Description", w: col.desc, a: "left" as const },
        { t: "Qty", w: col.qty, a: "right" as const },
        { t: "Unit", w: col.unit, a: "right" as const },
        { t: "Tax", w: col.tax, a: "right" as const },
        { t: "Amount", w: col.total, a: "right" as const },
      ];
      doc.fillColor(accent).font("Helvetica-Bold").fontSize(9);
      headers.forEach((h) => {
        doc.text(h.t, x + 6, y + 8, { width: h.w - 12, align: h.a });
        x += h.w;
      });
      doc
        .rect(tableX, y, contentWidth, 24)
        .strokeColor(light)
        .lineWidth(1)
        .stroke();
    };

    drawTableHeader(cursorY);
    cursorY += 24;
    const summaryHeight = 90;
    const footerReserve = 30;
    const maxBodyY = doc.page.height - footerReserve;

    quotation.items.forEach((item, index) => {
      const description = item.description ?? item.product.name;
      const estimatedRowHeight =
        Math.max(
          22,
          doc.heightOfString(description, {
            width: col.desc - 12,
            align: "left",
          }) + 8,
        ) + 8;
      if (cursorY + estimatedRowHeight + summaryHeight + 10 > maxBodyY) {
        doc.addPage();
        cursorY = margin;
        drawTableHeader(cursorY);
        cursorY += 24;
      }

      doc
        .rect(tableX, cursorY, contentWidth, estimatedRowHeight)
        .strokeColor(light)
        .lineWidth(1)
        .stroke();
      let x = tableX;
      doc.fillColor(muted).font("Helvetica").fontSize(9);
      doc.text(String(index + 1), x + 6, cursorY + 8, { width: col.no - 12 });
      x += col.no;
      doc.text(description, x + 6, cursorY + 8, {
        width: col.desc - 12,
      });
      x += col.desc;
      doc.text(Number(item.quantity).toFixed(2), x + 6, cursorY + 8, {
        width: col.qty - 12,
        align: "right",
      });
      x += col.qty;
      doc.text(Number(item.unitPrice).toFixed(2), x + 6, cursorY + 8, {
        width: col.unit - 12,
        align: "right",
      });
      x += col.unit;
      doc.text(Number(item.taxAmount).toFixed(2), x + 6, cursorY + 8, {
        width: col.tax - 12,
        align: "right",
      });
      x += col.tax;
      doc.text(Number(item.lineTotal).toFixed(2), x + 6, cursorY + 8, {
        width: col.total - 12,
        align: "right",
      });

      cursorY += estimatedRowHeight;
    });

    let summaryTop = cursorY + 10;
    if (summaryTop + summaryHeight > maxBodyY) {
      doc.addPage();
      summaryTop = margin;
    }
    const summaryX = margin + contentWidth - 230;
    doc
      .rect(summaryX, summaryTop, 230, 90)
      .strokeColor(light)
      .lineWidth(1)
      .stroke();
    const rows = [
      { label: "Subtotal", value: Number(quotation.subtotal) },
      {
        label: `Tax (${Number(tenant.defaultTaxPercent).toFixed(2)}%)`,
        value: Number(quotation.taxAmount),
      },
      { label: "Grand Total", value: Number(quotation.totalAmount) },
    ];
    rows.forEach((row, idx) => {
      const y = summaryTop + 10 + idx * 24;
      doc
        .fillColor(idx === 2 ? accent : muted)
        .font(idx === 2 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(10)
        .text(row.label, summaryX + 10, y);
      doc.text(money(row.value), summaryX + 10, y, {
        width: 210,
        align: "right",
      });
    });

    const footer =
      `${tenant.tradeName ?? tenant.companyName} • ${tenant.preparedByLabel ?? "Prepared by"}: ${quotation.createdBy.firstName} ${quotation.createdBy.lastName ?? ""}`.trim();
    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(8)
      .text(footer, margin, doc.page.height - 30, {
        width: contentWidth,
        align: "center",
      });

    doc.end();
    const buffer = await bufferPromise;
    return { buffer, filename };
  }
}
