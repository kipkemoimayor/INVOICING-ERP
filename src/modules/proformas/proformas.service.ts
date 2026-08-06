import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as PDFKit from "pdfkit";
import { existsSync } from "fs";
import { join } from "path";
import { DocumentType, Prisma, ProformaStatus } from "@prisma/client";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { SettingsService } from "../settings/settings.service";
import { QueryProformasDto } from "./dto/query-proformas.dto";
import { UpdateProformaDto } from "./dto/update-proforma.dto";

@Injectable()
export class ProformasService {
  constructor(
    private readonly prisma: DataAccessService,
    private readonly settingsService: SettingsService,
  ) {}

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

  private buildWhere(
    query: QueryProformasDto,
  ): Prisma.ProformaInvoiceWhereInput {
    const where: Prisma.ProformaInvoiceWhereInput = {
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
        { proformaNumber: { contains: query.search, mode: "insensitive" } },
        {
          quotation: {
            quotationNumber: { contains: query.search, mode: "insensitive" },
          },
        },
        {
          customer: {
            companyName: { contains: query.search, mode: "insensitive" },
          },
        },
      ];
    }

    return where;
  }

  async findAll(query: QueryProformasDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.proformaInvoice.findMany({
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
          quotation: {
            select: {
              id: true,
              quotationNumber: true,
            },
          },
          items: true,
        },
      }),
      this.prisma.proformaInvoice.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const proforma = await this.prisma.proformaInvoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        quotation: true,
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

    if (!proforma) {
      throw new NotFoundException(`Proforma with id ${id} not found`);
    }

    return proforma;
  }

  async update(id: string, dto: UpdateProformaDto) {
    const existing = await this.findOne(id);
    if (existing.status !== ProformaStatus.PENDING) {
      throw new BadRequestException("Only pending proformas can be edited");
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        dueDate:
          dto.dueDate !== undefined
            ? dto.dueDate
              ? new Date(dto.dueDate)
              : null
            : undefined,
        currency: dto.currency?.trim().toUpperCase(),
        notes: dto.notes?.trim(),
      },
    });
  }

  async updateStatus(id: string, status: ProformaStatus) {
    const proforma = await this.findOne(id);
    const validTransitions: Record<ProformaStatus, ProformaStatus[]> = {
      PENDING: [
        ProformaStatus.APPROVED,
        ProformaStatus.CANCELLED,
        ProformaStatus.PAID,
      ],
      APPROVED: [ProformaStatus.PAID, ProformaStatus.CANCELLED],
      CANCELLED: [],
      PAID: [],
    };

    if (!validTransitions[proforma.status].includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${proforma.status} to ${status}`,
      );
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        status,
        approvedAt:
          status === ProformaStatus.APPROVED ? new Date() : proforma.approvedAt,
        paidAt: status === ProformaStatus.PAID ? new Date() : proforma.paidAt,
      },
    });
  }

  async convertToInvoice(id: string) {
    const proforma = await this.findOne(id);
    if (
      proforma.status !== ProformaStatus.APPROVED &&
      proforma.status !== ProformaStatus.PAID
    ) {
      throw new BadRequestException(
        "Only approved or paid proformas can be converted to invoice",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.taxInvoice.findFirst({
        where: { proformaId: proforma.id, deletedAt: null },
      });
      if (existingInvoice) {
        return existingInvoice;
      }

      const invoiceNumber = await this.generateInvoiceNumber(tx);
      return tx.taxInvoice.create({
        data: {
          invoiceNumber,
          quotationId: proforma.quotationId,
          proformaId: proforma.id,
          customerId: proforma.customerId,
          issueDate: new Date(),
          dueDate: proforma.dueDate,
          currency: proforma.currency,
          subtotal: proforma.subtotal,
          discountAmount: proforma.discountAmount,
          taxAmount: proforma.taxAmount,
          totalAmount: proforma.totalAmount,
          totalPaid: 0,
          balanceDue: proforma.totalAmount,
          createdById: proforma.createdById,
          items: {
            create: proforma.items.map((item) => ({
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
    });
  }

  async remove(id: string) {
    const proforma = await this.findOne(id);
    if (proforma.status === ProformaStatus.PAID) {
      throw new BadRequestException("Paid proformas cannot be deleted");
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: ProformaStatus.CANCELLED,
      },
    });
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const proforma = await this.findOne(id);
    const tenant = await this.settingsService.getTenantConfiguration();
    const filename = `${proforma.proformaNumber}.pdf`;

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
      `${proforma.currency} ${value.toLocaleString(undefined, {
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
      .text(tenant.companyName, margin + 100, cursorY + 10, { width: 270 });
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
      .text("PROFORMA", margin + 360, cursorY + 18, {
        width: contentWidth - 360,
        align: "right",
      });
    cursorY += 78;

    doc
      .rect(margin, cursorY, contentWidth, 74)
      .strokeColor(light)
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Proforma Details", margin + 12, cursorY + 10);
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Proforma #: ${proforma.proformaNumber}`,
        margin + 12,
        cursorY + 28,
      );
    doc.text(
      `Issue Date: ${new Date(proforma.issueDate).toLocaleDateString()}`,
      margin + 12,
      cursorY + 44,
    );
    doc.text(
      `Due Date: ${proforma.dueDate ? new Date(proforma.dueDate).toLocaleDateString() : "N/A"}`,
      margin + 12,
      cursorY + 58,
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
      .text(proforma.customer.companyName, margin + 340, cursorY + 28, {
        width: 220,
      });
    doc.text(
      proforma.customer.contactPerson ?? "",
      margin + 340,
      cursorY + 42,
      { width: 220 },
    );
    doc.text(
      `Quotation: ${proforma.quotation?.quotationNumber ?? "N/A"}`,
      margin + 340,
      cursorY + 56,
      { width: 220 },
    );
    cursorY += 90;

    const tableX = margin;
    const col = { no: 30, desc: 200, qty: 55, unit: 80, tax: 65, total: 85 };
    const drawHeader = (y: number) => {
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

    drawHeader(cursorY);
    cursorY += 24;
    const summaryHeight = 80;
    const footerReserve = 30;
    const maxBodyY = doc.page.height - footerReserve;
    proforma.items.forEach((item, index) => {
      const description = item.description ?? item.product.name;
      const rowHeight =
        Math.max(
          22,
          doc.heightOfString(description, { width: col.desc - 12 }) + 8,
        ) + 8;
      if (cursorY + rowHeight + summaryHeight + 10 > maxBodyY) {
        doc.addPage();
        cursorY = margin;
        drawHeader(cursorY);
        cursorY += 24;
      }
      doc
        .rect(tableX, cursorY, contentWidth, rowHeight)
        .strokeColor(light)
        .lineWidth(1)
        .stroke();
      let x = tableX;
      doc.fillColor(muted).font("Helvetica").fontSize(9);
      doc.text(String(index + 1), x + 6, cursorY + 8, { width: col.no - 12 });
      x += col.no;
      doc.text(description, x + 6, cursorY + 8, { width: col.desc - 12 });
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
      cursorY += rowHeight;
    });

    let summaryTop = cursorY + 10;
    if (summaryTop + summaryHeight > maxBodyY) {
      doc.addPage();
      summaryTop = margin;
    }
    const summaryX = margin + contentWidth - 240;
    doc
      .rect(summaryX, summaryTop, 240, 80)
      .strokeColor(light)
      .lineWidth(1)
      .stroke();
    const rows = [
      { label: "Subtotal", value: Number(proforma.subtotal) },
      { label: "Tax", value: Number(proforma.taxAmount) },
      { label: "Total", value: Number(proforma.totalAmount), bold: true },
    ];
    rows.forEach((row, idx) => {
      const y = summaryTop + 10 + idx * 22;
      doc
        .fillColor(row.bold ? accent : muted)
        .font(row.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .text(row.label, summaryX + 10, y);
      doc.text(money(row.value), summaryX + 10, y, {
        width: 220,
        align: "right",
      });
    });

    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(8)
      .text(
        `${tenant.tradeName ?? tenant.companyName} • ${tenant.preparedByLabel ?? "Prepared by"}: ${proforma.createdBy.firstName} ${proforma.createdBy.lastName ?? ""} • Status: ${proforma.status}`,
        margin,
        doc.page.height - 30,
        { width: contentWidth, align: "center" },
      );

    doc.end();
    const buffer = await bufferPromise;
    return { buffer, filename };
  }
}
