import { Injectable } from "@nestjs/common";
import {
  DeliveryStatus,
  InvoiceStatus,
  PaymentStatus,
  QuotationStatus,
} from "@prisma-client";
import { DataAccessService } from "../../data-access/data-access.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: DataAccessService) {}

  async getStats() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      todaySalesAgg,
      outstandingQuotations,
      pendingDeliveries,
      pendingPayments,
      revenueAgg,
      invoices,
      monthlyPayments,
      paymentByCustomer,
      customers,
      recentLogs,
    ] = await this.prisma.$transaction([
      this.prisma.payment.aggregate({
        where: { paidAt: { gte: startOfToday, lte: endOfToday } },
        _sum: { amount: true },
      }),
      this.prisma.quotation.count({
        where: { deletedAt: null, status: QuotationStatus.SENT },
      }),
      this.prisma.deliveryNote.count({
        where: {
          deletedAt: null,
          status: { in: [DeliveryStatus.PENDING, DeliveryStatus.DISPATCHED] },
        },
      }),
      this.prisma.taxInvoice.count({
        where: {
          deletedAt: null,
          status: InvoiceStatus.APPROVED,
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID],
          },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.taxInvoice.count({
        where: { deletedAt: null },
      }),
      this.prisma.payment.findMany({
        where: { paidAt: { gte: sixMonthsAgo, lte: now } },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.payment.groupBy({
        by: ["customerId"],
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),
      this.prisma.customer.findMany({
        select: { id: true, companyName: true },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          action: true,
          message: true,
          resourceType: true,
        },
      }),
    ]);

    const customerMap = new Map(customers.map((x) => [x.id, x.companyName]));
    const topCustomers = paymentByCustomer.map((entry) => ({
      customerId: entry.customerId,
      customerName: customerMap.get(entry.customerId) ?? "Unknown Customer",
      amount: Number(entry._sum?.amount ?? 0),
    }));

    const monthlyMap = new Map<string, number>();
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(sixMonthsAgo.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }
    monthlyPayments.forEach((p) => {
      const d = new Date(p.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(p.amount));
    });
    const revenueTrend = Array.from(monthlyMap.entries()).map(
      ([month, total]) => ({
        month,
        total,
      }),
    );

    return {
      cards: {
        todaySales: Number(todaySalesAgg._sum.amount ?? 0),
        outstandingQuotations,
        pendingDeliveries,
        pendingPayments,
        revenue: Number(revenueAgg._sum.amount ?? 0),
        invoices,
      },
      revenueTrend,
      topCustomers,
      recentActivities: recentLogs.map((x) => ({
        id: x.id,
        createdAt: x.createdAt,
        action: x.action,
        resourceType: x.resourceType,
        message: x.message ?? `${x.action} ${x.resourceType}`,
      })),
    };
  }
}
