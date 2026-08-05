import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as PDFKit from "pdfkit";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  AuditAction,
  DocumentType,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
} from "@prisma-client";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { EmailService } from "../email/email.service";
import { DeliveryNotesService } from "../delivery-notes/delivery-notes.service";
import { SettingsService } from "../settings/settings.service";
import { QueryInvoicesDto } from "./dto/query-invoices.dto";
import { RecordInvoicePaymentDto } from "./dto/record-invoice-payment.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { UpdateInvoiceStatusDto } from "./dto/update-invoice-status.dto";

type PaymentProofFile = { buffer: Buffer; mimetype: string };
type ApprovalAttachmentFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: DataAccessService,
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
    private readonly deliveryNotesService: DeliveryNotesService,
  ) {}

  private async logInvoiceEmailFailure(
    invoice: Awaited<ReturnType<InvoicesService["findOne"]>>,
    errorMessage: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.SENT,
        resourceType: "INVOICE_EMAIL",
        resourceId: invoice.id,
        message: `FAILED: Invoice ${invoice.invoiceNumber} email failed (${errorMessage})`,
        metadata: {
          status: "FAILED",
          invoiceNumber: invoice.invoiceNumber,
          recipient: invoice.customer.email,
          error: errorMessage,
        },
      },
    });
  }

  private async sendInvoiceEmail(invoiceId: string) {
    const invoice = await this.findOne(invoiceId);
    if (!invoice.customer.email) {
      throw new BadRequestException(
        "Customer email is required before sending invoice",
      );
    }

    const tenant = await this.settingsService.getTenantConfiguration();
    const { buffer, filename } = await this.generatePdf(invoiceId);
    const subject = `Invoice ${invoice.invoiceNumber} from ${tenant.companyName}`;
    const body = [
      `Dear ${invoice.customer.contactPerson ?? invoice.customer.companyName},`,
      "",
      `Please find attached invoice ${invoice.invoiceNumber}.`,
      "",
      `Total: ${invoice.currency} ${Number(invoice.totalAmount).toFixed(2)}`,
      `Balance Due: ${invoice.currency} ${Number(invoice.balanceDue).toFixed(2)}`,
      "",
      "Regards,",
      tenant.companyName,
    ].join("\n");

    await this.emailService.sendMail({
      to: invoice.customer.email,
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
        resourceType: "INVOICE_EMAIL",
        resourceId: invoice.id,
        message: `SUCCESS: Invoice ${invoice.invoiceNumber} emailed to ${invoice.customer.email}`,
        metadata: {
          status: "SUCCESS",
          invoiceNumber: invoice.invoiceNumber,
          recipient: invoice.customer.email,
          subject,
        },
      },
    });
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

  async configureNumberingStart(startFrom: number) {
    return this.prisma.$transaction(async (tx) => {
      let candidate = startFrom;
      let existing = await tx.taxInvoice.findUnique({
        where: { invoiceNumber: String(candidate) },
        select: { id: true },
      });

      while (existing) {
        candidate += 1;
        existing = await tx.taxInvoice.findUnique({
          where: { invoiceNumber: String(candidate) },
          select: { id: true },
        });
      }

      const sequence = await tx.documentSequence.findUnique({
        where: {
          uq_document_sequences_type_year: {
            documentType: DocumentType.TAX_INVOICE,
            year: 0,
          },
        },
      });

      if (sequence && sequence.lastNumber >= candidate) {
        throw new BadRequestException(
          `Invoice number already at ${sequence.lastNumber}. Use a value above it.`,
        );
      }

      const nextLastNumber = candidate - 1;

      await tx.documentSequence.upsert({
        where: {
          uq_document_sequences_type_year: {
            documentType: DocumentType.TAX_INVOICE,
            year: 0,
          },
        },
        update: {
          lastNumber: nextLastNumber,
          prefix: "NUM",
        },
        create: {
          documentType: DocumentType.TAX_INVOICE,
          year: 0,
          prefix: "NUM",
          lastNumber: nextLastNumber,
        },
      });

      return { nextInvoiceNumber: String(candidate) };
    });
  }

  private buildWhere(query: QueryInvoicesDto): Prisma.TaxInvoiceWhereInput {
    const where: Prisma.TaxInvoiceWhereInput = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
        {
          proforma: {
            proformaNumber: { contains: query.search, mode: "insensitive" },
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

  async findAll(query: QueryInvoicesDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.taxInvoice.findMany({
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
          proforma: {
            select: {
              id: true,
              proformaNumber: true,
            },
          },
          items: true,
        },
      }),
      this.prisma.taxInvoice.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.taxInvoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        proforma: true,
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
        payments: {
          orderBy: { paidAt: "desc" },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with id ${id} not found`);
    }

    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findOne(id);
    if (invoice.status === InvoiceStatus.APPROVED) {
      throw new BadRequestException("Approved invoices cannot be edited");
    }

    return this.prisma.taxInvoice.update({
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

  private saveInvoiceApprovalAttachment(attachment: ApprovalAttachmentFile): {
    fileName: string;
    mimeType: string;
    storagePath: string;
    sizeBytes: number;
  } {
    const uploadDir = join(process.cwd(), "uploads", "invoices", "approvals");
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    const extension =
      attachment.mimetype === "application/pdf"
        ? ".pdf"
        : attachment.mimetype === "image/png"
          ? ".png"
          : attachment.mimetype === "image/jpeg"
            ? ".jpg"
            : attachment.mimetype === "image/webp"
              ? ".webp"
              : attachment.mimetype === "application/msword"
                ? ".doc"
                : ".docx";
    const fileName = `invoice-approval-${Date.now()}${extension}`;
    const absolutePath = join(uploadDir, fileName);
    writeFileSync(absolutePath, attachment.buffer);
    return {
      fileName: attachment.originalname?.trim() || fileName,
      mimeType: attachment.mimetype,
      sizeBytes: attachment.size ?? attachment.buffer.byteLength,
      storagePath: join("uploads", "invoices", "approvals", fileName).replace(
        /\\/g,
        "/",
      ),
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateInvoiceStatusDto,
    attachment?: ApprovalAttachmentFile,
  ) {
    const invoice = await this.findOne(id);
    const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      DRAFT: [
        InvoiceStatus.APPROVED,
        InvoiceStatus.CANCELLED,
        InvoiceStatus.VOIDED,
      ],
      APPROVED: [InvoiceStatus.VOIDED, InvoiceStatus.CANCELLED],
      VOIDED: [],
      CANCELLED: [],
    };

    if (!validTransitions[invoice.status].includes(dto.status)) {
      throw new BadRequestException(
        `Invalid transition from ${invoice.status} to ${dto.status}`,
      );
    }

    let attachmentInfo:
      | {
          fileName: string;
          mimeType: string;
          storagePath: string;
          sizeBytes: number;
        }
      | undefined;

    if (dto.status === InvoiceStatus.APPROVED) {
      if (!dto.approvalDocumentType) {
        throw new BadRequestException(
          "Approval document type is required (LPO or DELIVERY_NOTE)",
        );
      }
      if (!dto.approvalComments?.trim()) {
        throw new BadRequestException("Approval comments are required");
      }
      if (!attachment) {
        throw new BadRequestException(
          "Approval attachment is required when approving invoice",
        );
      }
      attachmentInfo = this.saveInvoiceApprovalAttachment(attachment);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.taxInvoice.update({
        where: { id },
        data: {
          status: dto.status,
          approvedAt:
            dto.status === InvoiceStatus.APPROVED
              ? new Date()
              : invoice.approvedAt,
        },
      });

      if (
        dto.status === InvoiceStatus.APPROVED &&
        attachmentInfo &&
        dto.approvalDocumentType !== "DELIVERY_NOTE"
      ) {
        const uploadedById = await this.ensureSystemUserId(tx);
        const fileAsset = await tx.fileAsset.create({
          data: {
            documentType: DocumentType.TAX_INVOICE,
            documentId: id,
            fileName: attachmentInfo.fileName,
            mimeType: attachmentInfo.mimeType,
            storagePath: attachmentInfo.storagePath,
            sizeBytes: attachmentInfo.sizeBytes,
            uploadedById,
          },
        });

        await tx.auditLog.create({
          data: {
            action: AuditAction.APPROVED,
            resourceType: "INVOICE_APPROVAL_DOC",
            resourceId: id,
            message: `Invoice ${invoice.invoiceNumber} approved with ${dto.approvalDocumentType}`,
            metadata: {
              invoiceNumber: invoice.invoiceNumber,
              documentType: dto.approvalDocumentType,
              comments: dto.approvalComments?.trim(),
              amount: dto.approvalAmount ?? null,
              fileAssetId: fileAsset.id,
              attachmentPath: attachmentInfo.storagePath,
            },
          },
        });
      }

      return updatedInvoice;
    });

    if (dto.status === InvoiceStatus.APPROVED) {
      if (
        dto.approvalDocumentType === "DELIVERY_NOTE" &&
        attachmentInfo &&
        dto.approvalComments
      ) {
        await this.deliveryNotesService.createFromInvoiceApproval(id, {
          comments: dto.approvalComments,
          amount: dto.approvalAmount,
          attachment: attachmentInfo,
        });
      }
      try {
        await this.sendInvoiceEmail(id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send invoice";
        const approvedInvoice = await this.findOne(id);
        await this.logInvoiceEmailFailure(approvedInvoice, errorMessage);
        throw new BadRequestException(
          `Invoice approved, but email delivery failed: ${errorMessage}`,
        );
      }
    }

    return updated;
  }

  private savePaymentProofFile(
    proof: PaymentProofFile | undefined,
  ): string | undefined {
    if (!proof || !proof.buffer) {
      return undefined;
    }
    const uploadDir = join(process.cwd(), "uploads", "payments");
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    const extension =
      proof.mimetype === "application/pdf"
        ? ".pdf"
        : proof.mimetype === "image/png"
          ? ".png"
          : proof.mimetype === "image/jpeg"
            ? ".jpg"
            : ".webp";
    const filename = `payment-proof-${Date.now()}${extension}`;
    const absolutePath = join(uploadDir, filename);
    writeFileSync(absolutePath, proof.buffer);
    return join("uploads", "payments", filename).replace(/\\/g, "/");
  }

  async recordPayment(
    id: string,
    dto: RecordInvoicePaymentDto,
    proof?: PaymentProofFile,
  ) {
    const invoice = await this.findOne(id);
    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException(
        "Payments can only be recorded for approved invoices",
      );
    }
    const proofPath = this.savePaymentProofFile(proof);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.taxInvoice.findUnique({
        where: { id },
      });
      if (!current) {
        throw new NotFoundException(`Invoice with id ${id} not found`);
      }

      const currentPaid = Number(current.totalPaid);
      const totalAmount = Number(current.totalAmount);
      const newTotalPaid = currentPaid + dto.amount;

      if (newTotalPaid - totalAmount > 0.001) {
        throw new BadRequestException("Payment exceeds outstanding balance");
      }

      const paymentStatus =
        newTotalPaid <= 0
          ? PaymentStatus.UNPAID
          : newTotalPaid < totalAmount
            ? PaymentStatus.PARTIALLY_PAID
            : PaymentStatus.PAID;

      const createdById = await this.ensureSystemUserId(tx);
      const paymentNumber = await this.generateDocumentNumber(
        tx,
        DocumentType.PAYMENT_RECEIPT,
        "PAY",
      );

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          customerId: current.customerId,
          invoiceId: current.id,
          proformaId: current.proformaId,
          method: dto.method,
          amount: dto.amount,
          reference: dto.reference?.trim(),
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          notes: dto.notes?.trim(),
          receiptPath: proofPath,
          createdById,
        },
      });

      await tx.taxInvoice.update({
        where: { id: current.id },
        data: {
          totalPaid: newTotalPaid,
          balanceDue: Math.max(totalAmount - newTotalPaid, 0),
          paymentStatus,
        },
      });

      return payment;
    });
  }

  async remove(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === InvoiceStatus.APPROVED) {
      throw new BadRequestException("Approved invoices cannot be deleted");
    }
    if (invoice.payments.length > 0) {
      throw new BadRequestException(
        "Invoices with recorded payments cannot be deleted",
      );
    }

    return this.prisma.taxInvoice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getPaymentProof(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, receiptPath: true },
    });
    if (!payment) {
      throw new NotFoundException(`Payment with id ${paymentId} not found`);
    }
    if (!payment.receiptPath) {
      throw new NotFoundException("Payment proof not found");
    }
    const absolutePath = join(process.cwd(), payment.receiptPath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException("Payment proof file is missing");
    }
    const lower = absolutePath.toLowerCase();
    const contentType = lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : "image/webp";
    return {
      stream: createReadStream(absolutePath),
      filename: absolutePath.split("\\").pop() ?? "payment-proof",
      contentType,
    };
  }

  async generatePdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.findOne(id);
    const tenant = await this.settingsService.getTenantConfiguration();
    const filename = `${invoice.invoiceNumber}.pdf`;

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
      `${invoice.currency} ${value.toLocaleString(undefined, {
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
      .text("TAX INVOICE", margin + 360, cursorY + 18, {
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
      .text("Invoice Details", margin + 12, cursorY + 10);
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(10)
      .text(`Invoice #: ${invoice.invoiceNumber}`, margin + 12, cursorY + 28);
    doc.text(
      `Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`,
      margin + 12,
      cursorY + 44,
    );
    doc.text(
      `Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}`,
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
      .text(invoice.customer.companyName, margin + 340, cursorY + 28, {
        width: 220,
      });
    doc.text(invoice.customer.contactPerson ?? "", margin + 340, cursorY + 42, {
      width: 220,
    });
    doc.text(invoice.customer.phone ?? "", margin + 340, cursorY + 56, {
      width: 220,
    });
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
    const summaryHeight = 116;
    const footerReserve = 30;
    const maxBodyY = doc.page.height - footerReserve;
    invoice.items.forEach((item, index) => {
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
      .rect(summaryX, summaryTop, 240, 116)
      .strokeColor(light)
      .lineWidth(1)
      .stroke();
    const rows = [
      { label: "Subtotal", value: Number(invoice.subtotal) },
      { label: "Tax", value: Number(invoice.taxAmount) },
      { label: "Total", value: Number(invoice.totalAmount) },
      { label: "Paid", value: Number(invoice.totalPaid) },
      { label: "Balance", value: Number(invoice.balanceDue), bold: true },
    ];
    rows.forEach((row, idx) => {
      const y = summaryTop + 8 + idx * 21;
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
        `${tenant.tradeName ?? tenant.companyName} • ${tenant.preparedByLabel ?? "Prepared by"}: ${invoice.createdBy.firstName} ${invoice.createdBy.lastName ?? ""} • Status: ${invoice.status} • Payment: ${invoice.paymentStatus}`,
        margin,
        doc.page.height - 30,
        { width: contentWidth, align: "center" },
      );

    doc.end();
    const buffer = await bufferPromise;
    return { buffer, filename };
  }
}
