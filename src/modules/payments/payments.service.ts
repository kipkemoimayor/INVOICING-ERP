import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  DocumentType,
  PaymentStatus,
  Prisma,
  ProformaStatus,
} from "@prisma/client";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { InvoicesService } from "../invoices/invoices.service";
import { RecordInvoicePaymentDto } from "../invoices/dto/record-invoice-payment.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { QueryPaymentStatementDto } from "./dto/query-payment-statement.dto";
import { QueryPaymentsDto } from "./dto/query-payments.dto";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: DataAccessService,
    private readonly invoicesService: InvoicesService,
  ) {}

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

  private savePaymentProofFile(
    proof:
      | {
          buffer: Buffer;
          mimetype: string;
        }
      | undefined,
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

  private buildWhere(query: QueryPaymentsDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.proformaId) where.proformaId = query.proformaId;
    if (query.method) where.method = query.method;
    if (query.search) {
      where.OR = [
        { paymentNumber: { contains: query.search, mode: "insensitive" } },
        { reference: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
        {
          customer: {
            companyName: { contains: query.search, mode: "insensitive" },
          },
        },
        {
          invoice: {
            invoiceNumber: { contains: query.search, mode: "insensitive" },
          },
        },
        {
          proforma: {
            proformaNumber: { contains: query.search, mode: "insensitive" },
          },
        },
      ];
    }
    return where;
  }

  async findAll(query: QueryPaymentsDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: { id: true, companyName: true },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              taxAmount: true,
              totalAmount: true,
              currency: true,
            },
          },
          proforma: {
            select: {
              id: true,
              proformaNumber: true,
              taxAmount: true,
              totalAmount: true,
              currency: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: true,
        proforma: true,
      },
    });
    if (!payment) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }
    return payment;
  }

  async create(
    dto: CreatePaymentDto,
    proof?: {
      buffer: Buffer;
      mimetype: string;
    },
  ) {
    if ((dto.invoiceId ? 1 : 0) + (dto.proformaId ? 1 : 0) !== 1) {
      throw new BadRequestException(
        "Provide exactly one source: invoiceId or proformaId",
      );
    }

    if (dto.invoiceId) {
      const invoicePayload: RecordInvoicePaymentDto = {
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference,
        paidAt: dto.paidAt,
        notes: dto.notes,
      };
      return this.invoicesService.recordPayment(
        dto.invoiceId,
        invoicePayload,
        proof,
      );
    }

    const proofPath = this.savePaymentProofFile(proof);
    return this.prisma.$transaction(async (tx) => {
      const proforma = await tx.proformaInvoice.findFirst({
        where: { id: dto.proformaId, deletedAt: null },
      });
      if (!proforma) {
        throw new NotFoundException(
          `Proforma with id ${dto.proformaId} not found`,
        );
      }
      if (proforma.status !== ProformaStatus.APPROVED) {
        throw new BadRequestException(
          "Payments can only be recorded for approved proformas",
        );
      }

      const summary = await tx.payment.aggregate({
        where: { proformaId: proforma.id },
        _sum: { amount: true },
      });
      const currentPaid = Number(summary._sum.amount ?? 0);
      const totalAmount = Number(proforma.totalAmount);
      const newTotalPaid = currentPaid + dto.amount;
      if (newTotalPaid - totalAmount > 0.001) {
        throw new BadRequestException("Payment exceeds outstanding balance");
      }

      const createdById = await this.ensureSystemUserId(tx);
      const paymentNumber = await this.generateDocumentNumber(
        tx,
        DocumentType.PAYMENT_RECEIPT,
        "PAY",
      );
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          customerId: proforma.customerId,
          proformaId: proforma.id,
          method: dto.method,
          amount: dto.amount,
          reference: dto.reference?.trim(),
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          notes: dto.notes?.trim(),
          receiptPath: proofPath,
          createdById,
        },
      });

      if (Math.abs(totalAmount - newTotalPaid) <= 0.001) {
        await tx.proformaInvoice.update({
          where: { id: proforma.id },
          data: {
            status: ProformaStatus.PAID,
            paidAt: new Date(),
          },
        });
      }

      return payment;
    });
  }

  async getProof(paymentId: string) {
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

  async reverse(id: string) {
    const payment = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.payment.findUnique({
        where: { id },
      });
      if (!target) {
        throw new NotFoundException(`Payment with id ${id} not found`);
      }

      if (target.invoiceId) {
        const invoice = await tx.taxInvoice.findUnique({
          where: { id: target.invoiceId },
        });
        if (!invoice) {
          throw new NotFoundException(
            `Invoice with id ${target.invoiceId} not found`,
          );
        }
        const summary = await tx.payment.aggregate({
          where: {
            invoiceId: target.invoiceId,
            id: { not: id },
          },
          _sum: { amount: true },
        });
        const remainingPaid = Number(summary._sum.amount ?? 0);
        const totalAmount = Number(invoice.totalAmount);
        const paymentStatus =
          remainingPaid <= 0
            ? PaymentStatus.UNPAID
            : remainingPaid < totalAmount
              ? PaymentStatus.PARTIALLY_PAID
              : PaymentStatus.PAID;

        await tx.taxInvoice.update({
          where: { id: target.invoiceId },
          data: {
            totalPaid: remainingPaid,
            balanceDue: Math.max(totalAmount - remainingPaid, 0),
            paymentStatus,
          },
        });
      }

      if (target.proformaId) {
        const proforma = await tx.proformaInvoice.findUnique({
          where: { id: target.proformaId },
        });
        if (!proforma) {
          throw new NotFoundException(
            `Proforma with id ${target.proformaId} not found`,
          );
        }
        const summary = await tx.payment.aggregate({
          where: {
            proformaId: target.proformaId,
            id: { not: id },
          },
          _sum: { amount: true },
        });
        const remainingPaid = Number(summary._sum.amount ?? 0);
        const totalAmount = Number(proforma.totalAmount);
        const fullyPaid = Math.abs(totalAmount - remainingPaid) <= 0.001;
        await tx.proformaInvoice.update({
          where: { id: target.proformaId },
          data: fullyPaid
            ? {
                status: ProformaStatus.PAID,
                paidAt: proforma.paidAt ?? new Date(),
              }
            : {
                status: ProformaStatus.APPROVED,
                paidAt: null,
              },
        });
      }

      await tx.payment.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: AuditAction.DELETED,
          resourceType: "PAYMENT",
          resourceId: id,
          message: `Payment ${payment.paymentNumber} reversed`,
          metadata: {
            paymentNumber: payment.paymentNumber,
            invoiceId: payment.invoiceId ?? null,
            proformaId: payment.proformaId ?? null,
            amount: Number(payment.amount),
          },
        },
      });

      return {
        message: `Payment ${payment.paymentNumber} reversed successfully`,
      };
    });
  }

  async getStatement(query: QueryPaymentStatementDto) {
    const fromDate = new Date(query.fromDate);
    const toDate = new Date(query.toDate);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Invalid date range");
    }
    if (fromDate > toDate) {
      throw new BadRequestException("fromDate cannot be after toDate");
    }
    const maxToDate = new Date(fromDate);
    maxToDate.setMonth(maxToDate.getMonth() + 6);
    if (toDate > maxToDate) {
      throw new BadRequestException("Statement range cannot exceed 6 months");
    }

    const where: Prisma.PaymentWhereInput = {
      paidAt: {
        gte: fromDate,
        lte: toDate,
      },
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: "asc" },
      include: {
        customer: {
          select: { id: true, companyName: true },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            taxAmount: true,
            totalAmount: true,
            currency: true,
          },
        },
        proforma: {
          select: {
            id: true,
            proformaNumber: true,
            taxAmount: true,
            totalAmount: true,
            currency: true,
          },
        },
      },
    });

    const totals = payments.reduce(
      (acc, item) => {
        const gross = Number(item.amount);
        const sourceTotal = Number(
          item.invoice?.totalAmount ?? item.proforma?.totalAmount ?? 0,
        );
        const sourceTax = Number(
          item.invoice?.taxAmount ?? item.proforma?.taxAmount ?? 0,
        );
        const tax = sourceTotal > 0 ? gross * (sourceTax / sourceTotal) : 0;
        acc.grossTotal += gross;
        acc.taxTotal += tax;
        acc.netTotal += Math.max(gross - tax, 0);
        return acc;
      },
      { grossTotal: 0, taxTotal: 0, netTotal: 0 },
    );

    return {
      fromDate,
      toDate,
      customerId: query.customerId ?? null,
      count: payments.length,
      totals,
      data: payments,
    };
  }

  async exportExcel(query: QueryPaymentsDto) {
    const where = this.buildWhere(query);
    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      include: {
        customer: {
          select: { companyName: true },
        },
        invoice: {
          select: {
            invoiceNumber: true,
            taxAmount: true,
            totalAmount: true,
            currency: true,
          },
        },
        proforma: {
          select: {
            proformaNumber: true,
            taxAmount: true,
            totalAmount: true,
            currency: true,
          },
        },
      },
    });

    const rows = payments.map((payment) => {
      const amount = Number(payment.amount);
      const sourceTotal = Number(
        payment.invoice?.totalAmount ?? payment.proforma?.totalAmount ?? 0,
      );
      const sourceTax = Number(
        payment.invoice?.taxAmount ?? payment.proforma?.taxAmount ?? 0,
      );
      const taxAmount =
        sourceTotal > 0 ? amount * (sourceTax / sourceTotal) : 0;
      const netAmount = Math.max(amount - taxAmount, 0);
      const currency =
        payment.invoice?.currency ?? payment.proforma?.currency ?? "KSH";

      return {
        "Payment Number": payment.paymentNumber,
        "Paid At": payment.paidAt.toISOString(),
        Customer: payment.customer.companyName,
        Source: payment.invoice
          ? `Invoice ${payment.invoice.invoiceNumber}`
          : payment.proforma
            ? `Proforma ${payment.proforma.proformaNumber}`
            : "-",
        Method: payment.method,
        Currency: currency,
        "Gross Amount": amount,
        "Tax Amount": Number(taxAmount.toFixed(2)),
        "Net Amount": Number(netAmount.toFixed(2)),
        Reference: payment.reference ?? "",
        Notes: payment.notes ?? "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");
    const buffer = Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );

    return {
      buffer,
      filename: `payments-${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }
}
