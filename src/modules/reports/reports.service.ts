import { Injectable } from "@nestjs/common";
import { DeliveryStatus, Prisma, QuotationStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { QueryEmailReportDto } from "./dto/query-email-report.dto";
import { QuerySalesReportDto } from "./dto/query-sales-report.dto";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: DataAccessService) {}

  private buildInvoiceWhere(
    query: QuerySalesReportDto,
  ): Prisma.TaxInvoiceWhereInput {
    const where: Prisma.TaxInvoiceWhereInput = {
      deletedAt: null,
    };

    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }
    if (query.fromDate || query.toDate) {
      where.issueDate = {};
      if (query.fromDate) {
        where.issueDate.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        where.issueDate.lte = to;
      }
    }
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
        {
          customer: {
            companyName: { contains: query.search, mode: "insensitive" },
          },
        },
      ];
    }

    return where;
  }

  private buildPaymentWhere(
    query: QuerySalesReportDto,
  ): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.fromDate || query.toDate) {
      where.paidAt = {};
      if (query.fromDate) {
        where.paidAt.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        where.paidAt.lte = to;
      }
    }
    return where;
  }

  async getOverview(query: QuerySalesReportDto) {
    const invoiceWhere = this.buildInvoiceWhere(query);
    const paymentWhere = this.buildPaymentWhere(query);
    const quotationWhere: Prisma.QuotationWhereInput = {
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            issueDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate
                ? {
                    lte: (() => {
                      const to = new Date(query.toDate);
                      to.setHours(23, 59, 59, 999);
                      return to;
                    })(),
                  }
                : {}),
            },
          }
        : {}),
    };

    const deliveryWhere: Prisma.DeliveryNoteWhereInput = {
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate
                ? {
                    lte: (() => {
                      const to = new Date(query.toDate);
                      to.setHours(23, 59, 59, 999);
                      return to;
                    })(),
                  }
                : {}),
            },
          }
        : {}),
    };

    const [
      quotationCount,
      acceptedCount,
      quotationAmountAggregate,
      invoiceStats,
      paymentStats,
      pendingDeliveries,
      invoicesForTopCustomers,
      invoiceItemsForTopProducts,
      payments,
    ] = await this.prisma.$transaction([
      this.prisma.quotation.count({ where: quotationWhere }),
      this.prisma.quotation.count({
        where: {
          ...quotationWhere,
          status: QuotationStatus.ACCEPTED,
        },
      }),
      this.prisma.quotation.aggregate({
        where: quotationWhere,
        _sum: { totalAmount: true },
      }),
      this.prisma.taxInvoice.aggregate({
        where: invoiceWhere,
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          taxAmount: true,
          balanceDue: true,
        },
      }),
      this.prisma.payment.aggregate({
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.deliveryNote.count({
        where: {
          ...deliveryWhere,
          status: { not: DeliveryStatus.DELIVERED },
        },
      }),
      this.prisma.taxInvoice.findMany({
        where: invoiceWhere,
        select: {
          customerId: true,
          totalAmount: true,
          customer: {
            select: {
              companyName: true,
            },
          },
        },
      }),
      this.prisma.invoiceItem.findMany({
        where: {
          invoice: invoiceWhere,
        },
        select: {
          productId: true,
          quantity: true,
          lineTotal: true,
          product: {
            select: {
              name: true,
              sku: true,
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        select: {
          amount: true,
          paidAt: true,
        },
      }),
    ]);

    const customerMap = new Map<
      string,
      { customerName: string; invoiceCount: number; totalAmount: number }
    >();
    invoicesForTopCustomers.forEach((invoice) => {
      const current = customerMap.get(invoice.customerId) ?? {
        customerName: invoice.customer.companyName,
        invoiceCount: 0,
        totalAmount: 0,
      };
      current.invoiceCount += 1;
      current.totalAmount += Number(invoice.totalAmount);
      customerMap.set(invoice.customerId, current);
    });
    const topCustomers = [...customerMap.entries()]
      .map(([customerId, value]) => ({ customerId, ...value }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5)
      .map((row) => ({
        ...row,
        totalAmount: Number(row.totalAmount.toFixed(2)),
      }));

    const productMap = new Map<
      string,
      {
        productName: string;
        sku: string | null;
        quantity: number;
        revenue: number;
      }
    >();
    invoiceItemsForTopProducts.forEach((item) => {
      const current = productMap.get(item.productId) ?? {
        productName: item.product.name,
        sku: item.product.sku,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += Number(item.quantity);
      current.revenue += Number(item.lineTotal);
      productMap.set(item.productId, current);
    });
    const topProducts = [...productMap.entries()]
      .map(([productId, value]) => ({ productId, ...value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((row) => ({
        ...row,
        quantity: Number(row.quantity.toFixed(3)),
        revenue: Number(row.revenue.toFixed(2)),
      }));

    const trendMap = new Map<string, number>();
    payments.forEach((payment) => {
      const month = payment.paidAt.toISOString().slice(0, 7);
      trendMap.set(month, (trendMap.get(month) ?? 0) + Number(payment.amount));
    });
    const revenueTrend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({
        month,
        amount: Number(amount.toFixed(2)),
      }));

    return {
      filters: {
        fromDate: query.fromDate ?? null,
        toDate: query.toDate ?? null,
        customerId: query.customerId ?? null,
      },
      cards: {
        quotationsCount: quotationCount,
        quotationsAccepted: acceptedCount,
        quotationAmount: Number(
          Number(quotationAmountAggregate._sum.totalAmount ?? 0).toFixed(2),
        ),
        invoicesCount: invoiceStats._count._all,
        invoiceAmount: Number(
          Number(invoiceStats._sum.totalAmount ?? 0).toFixed(2),
        ),
        invoiceTaxAmount: Number(
          Number(invoiceStats._sum.taxAmount ?? 0).toFixed(2),
        ),
        paymentsCount: paymentStats._count._all,
        paymentsAmount: Number(
          Number(paymentStats._sum.amount ?? 0).toFixed(2),
        ),
        outstandingAmount: Number(
          Number(invoiceStats._sum.balanceDue ?? 0).toFixed(2),
        ),
        pendingDeliveries,
      },
      topCustomers,
      topProducts,
      revenueTrend,
    };
  }

  async getSalesReport(query: QuerySalesReportDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildInvoiceWhere(query);

    const [data, total, totals] = await this.prisma.$transaction([
      this.prisma.taxInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          status: true,
          paymentStatus: true,
          currency: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          totalPaid: true,
          balanceDue: true,
          customer: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      }),
      this.prisma.taxInvoice.count({ where }),
      this.prisma.taxInvoice.aggregate({
        where,
        _sum: {
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          totalPaid: true,
          balanceDue: true,
        },
      }),
    ]);

    return {
      data,
      total,
      limit,
      skip,
      totals: {
        subtotal: Number(Number(totals._sum.subtotal ?? 0).toFixed(2)),
        taxAmount: Number(Number(totals._sum.taxAmount ?? 0).toFixed(2)),
        totalAmount: Number(Number(totals._sum.totalAmount ?? 0).toFixed(2)),
        totalPaid: Number(Number(totals._sum.totalPaid ?? 0).toFixed(2)),
        balanceDue: Number(Number(totals._sum.balanceDue ?? 0).toFixed(2)),
      },
    };
  }

  async exportSalesExcel(query: QuerySalesReportDto) {
    const where = this.buildInvoiceWhere(query);
    const data = await this.prisma.taxInvoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      select: {
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        status: true,
        paymentStatus: true,
        currency: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        totalPaid: true,
        balanceDue: true,
        customer: {
          select: { companyName: true },
        },
      },
    });

    const rows = data.map((invoice) => ({
      "Invoice Number": invoice.invoiceNumber,
      "Issue Date": invoice.issueDate.toISOString().slice(0, 10),
      "Due Date": invoice.dueDate?.toISOString().slice(0, 10) ?? "",
      Customer: invoice.customer.companyName,
      Status: invoice.status,
      "Payment Status": invoice.paymentStatus,
      Currency: invoice.currency,
      Subtotal: Number(invoice.subtotal),
      Tax: Number(invoice.taxAmount),
      Total: Number(invoice.totalAmount),
      "Total Paid": Number(invoice.totalPaid),
      "Balance Due": Number(invoice.balanceDue),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Report");
    const buffer = Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );
    return {
      buffer,
      filename: `sales-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }

  async getEmailReport(query: QueryEmailReportDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;

    const where: Prisma.AuditLogWhereInput = {
      resourceType: "QUOTATION_EMAIL",
    };

    if (query.status) {
      where.message = { contains: `${query.status}:`, mode: "insensitive" };
    }
    if (query.search) {
      where.OR = [
        { message: { contains: query.search, mode: "insensitive" } },
        { resourceId: { equals: query.search } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          message: true,
          resourceId: true,
          metadata: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map((entry) => {
        const metadata = (entry.metadata ?? {}) as {
          status?: string;
          quotationNumber?: string;
          recipient?: string;
          subject?: string;
          error?: string;
        };
        return {
          id: entry.id,
          createdAt: entry.createdAt,
          quotationId: entry.resourceId,
          quotationNumber: metadata.quotationNumber ?? null,
          recipient: metadata.recipient ?? null,
          subject: metadata.subject ?? null,
          status:
            metadata.status ??
            (entry.message?.startsWith("FAILED:") ? "FAILED" : "SUCCESS"),
          message: entry.message,
          error: metadata.error ?? null,
        };
      }),
      total,
      limit,
      skip,
    };
  }
}
