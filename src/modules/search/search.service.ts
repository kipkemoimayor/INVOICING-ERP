import { Injectable, NotFoundException } from "@nestjs/common";
import { DataAccessService } from "../../data-access/data-access.service";
import { QueryGlobalSearchDto } from "./dto/query-global-search.dto";
import { QueryQuickViewDto } from "./dto/query-quick-view.dto";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: DataAccessService) {}

  async globalSearch(query: QueryGlobalSearchDto) {
    const term = query.q.trim();
    const limit = query.limit ?? 5;
    if (!term) {
      return {
        term,
        data: [],
      };
    }

    const [
      customers,
      products,
      quotations,
      proformas,
      invoices,
      deliveryNotes,
      payments,
    ] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { companyName: { contains: term, mode: "insensitive" } },
            { contactPerson: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
            { phone: { contains: term, mode: "insensitive" } },
            { customerCode: { contains: term, mode: "insensitive" } },
          ],
        },
        take: limit,
        orderBy: { companyName: "asc" },
        select: {
          id: true,
          companyName: true,
          customerCode: true,
        },
      }),
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { sku: { contains: term, mode: "insensitive" } },
          ],
        },
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
        },
      }),
      this.prisma.quotation.findMany({
        where: {
          deletedAt: null,
          OR: [
            { quotationNumber: { contains: term, mode: "insensitive" } },
            {
              customer: {
                companyName: { contains: term, mode: "insensitive" },
              },
            },
          ],
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          quotationNumber: true,
          customer: {
            select: { companyName: true },
          },
        },
      }),
      this.prisma.proformaInvoice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { proformaNumber: { contains: term, mode: "insensitive" } },
            {
              customer: {
                companyName: { contains: term, mode: "insensitive" },
              },
            },
          ],
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          proformaNumber: true,
          customer: {
            select: { companyName: true },
          },
        },
      }),
      this.prisma.taxInvoice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { invoiceNumber: { contains: term, mode: "insensitive" } },
            {
              customer: {
                companyName: { contains: term, mode: "insensitive" },
              },
            },
          ],
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          customer: {
            select: { companyName: true },
          },
        },
      }),
      this.prisma.deliveryNote.findMany({
        where: {
          deletedAt: null,
          OR: [
            { deliveryNumber: { contains: term, mode: "insensitive" } },
            {
              customer: {
                companyName: { contains: term, mode: "insensitive" },
              },
            },
          ],
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          deliveryNumber: true,
          customer: {
            select: { companyName: true },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          OR: [
            { paymentNumber: { contains: term, mode: "insensitive" } },
            { reference: { contains: term, mode: "insensitive" } },
            {
              customer: {
                companyName: { contains: term, mode: "insensitive" },
              },
            },
          ],
        },
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          paymentNumber: true,
          customer: {
            select: { companyName: true },
          },
        },
      }),
    ]);

    return {
      term,
      data: [
        ...customers.map((item) => ({
          type: "CUSTOMER",
          id: item.id,
          label: item.companyName,
          subtitle: item.customerCode,
          route: "/customers",
        })),
        ...products.map((item) => ({
          type: "PRODUCT",
          id: item.id,
          label: item.name,
          subtitle: item.sku,
          route: "/products",
        })),
        ...quotations.map((item) => ({
          type: "QUOTATION",
          id: item.id,
          label: item.quotationNumber,
          subtitle: item.customer.companyName,
          route: "/quotations",
        })),
        ...proformas.map((item) => ({
          type: "PROFORMA",
          id: item.id,
          label: item.proformaNumber,
          subtitle: item.customer.companyName,
          route: "/proforma",
        })),
        ...invoices.map((item) => ({
          type: "INVOICE",
          id: item.id,
          label: item.invoiceNumber,
          subtitle: item.customer.companyName,
          route: "/invoices",
        })),
        ...deliveryNotes.map((item) => ({
          type: "DELIVERY_NOTE",
          id: item.id,
          label: item.deliveryNumber,
          subtitle: item.customer.companyName,
          route: "/delivery-notes",
        })),
        ...payments.map((item) => ({
          type: "PAYMENT",
          id: item.id,
          label: item.paymentNumber,
          subtitle: item.customer.companyName,
          route: "/payments",
        })),
      ].slice(0, limit * 3),
    };
  }

  async quickView(query: QueryQuickViewDto) {
    const type = query.type;
    const id = query.id;

    if (type === "CUSTOMER") {
      const customer = await this.prisma.customer.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          companyName: true,
          customerCode: true,
          contactPerson: true,
          email: true,
          phone: true,
          status: true,
          taxNumber: true,
        },
      });
      if (!customer) throw new NotFoundException("Customer not found");
      return {
        item: {
          type,
          id: customer.id,
          label: customer.companyName,
          subtitle: customer.customerCode,
          route: "/customers",
        },
        details: [
          { label: "Customer Code", value: customer.customerCode },
          { label: "Contact Person", value: customer.contactPerson ?? "-" },
          { label: "Email", value: customer.email ?? "-" },
          { label: "Phone", value: customer.phone ?? "-" },
          { label: "Tax Number", value: customer.taxNumber ?? "-" },
          { label: "Status", value: customer.status },
        ],
      };
    }

    if (type === "PRODUCT") {
      const product = await this.prisma.product.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          costPrice: true,
          stock: true,
          isActive: true,
        },
      });
      if (!product) throw new NotFoundException("Product not found");
      return {
        item: {
          type,
          id: product.id,
          label: product.name,
          subtitle: product.sku,
          route: "/products",
        },
        details: [
          { label: "SKU", value: product.sku },
          {
            label: "Selling Price",
            value: Number(product.sellingPrice).toFixed(2),
          },
          { label: "Cost Price", value: Number(product.costPrice).toFixed(2) },
          { label: "Stock", value: Number(product.stock).toFixed(3) },
          { label: "Status", value: product.isActive ? "ACTIVE" : "INACTIVE" },
        ],
      };
    }

    if (type === "QUOTATION") {
      const quotation = await this.prisma.quotation.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          issueDate: true,
          expiryDate: true,
          totalAmount: true,
          currency: true,
          customer: { select: { companyName: true } },
        },
      });
      if (!quotation) throw new NotFoundException("Quotation not found");
      return {
        item: {
          type,
          id: quotation.id,
          label: quotation.quotationNumber,
          subtitle: quotation.customer.companyName,
          route: "/quotations",
        },
        details: [
          { label: "Customer", value: quotation.customer.companyName },
          { label: "Status", value: quotation.status },
          {
            label: "Issue Date",
            value: quotation.issueDate.toISOString().slice(0, 10),
          },
          {
            label: "Expiry Date",
            value: quotation.expiryDate
              ? quotation.expiryDate.toISOString().slice(0, 10)
              : "-",
          },
          {
            label: "Total",
            value: `${quotation.currency} ${Number(quotation.totalAmount).toFixed(2)}`,
          },
        ],
      };
    }

    if (type === "PROFORMA") {
      const proforma = await this.prisma.proformaInvoice.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          proformaNumber: true,
          status: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          currency: true,
          customer: { select: { companyName: true } },
        },
      });
      if (!proforma) throw new NotFoundException("Proforma not found");
      return {
        item: {
          type,
          id: proforma.id,
          label: proforma.proformaNumber,
          subtitle: proforma.customer.companyName,
          route: "/proforma",
        },
        details: [
          { label: "Customer", value: proforma.customer.companyName },
          { label: "Status", value: proforma.status },
          {
            label: "Issue Date",
            value: proforma.issueDate.toISOString().slice(0, 10),
          },
          {
            label: "Due Date",
            value: proforma.dueDate
              ? proforma.dueDate.toISOString().slice(0, 10)
              : "-",
          },
          {
            label: "Total",
            value: `${proforma.currency} ${Number(proforma.totalAmount).toFixed(2)}`,
          },
        ],
      };
    }

    if (type === "INVOICE") {
      const invoice = await this.prisma.taxInvoice.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          paymentStatus: true,
          issueDate: true,
          dueDate: true,
          totalAmount: true,
          balanceDue: true,
          currency: true,
          customer: { select: { companyName: true } },
        },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      return {
        item: {
          type,
          id: invoice.id,
          label: invoice.invoiceNumber,
          subtitle: invoice.customer.companyName,
          route: "/invoices",
        },
        details: [
          { label: "Customer", value: invoice.customer.companyName },
          { label: "Status", value: invoice.status },
          { label: "Payment Status", value: invoice.paymentStatus },
          {
            label: "Issue Date",
            value: invoice.issueDate.toISOString().slice(0, 10),
          },
          {
            label: "Due Date",
            value: invoice.dueDate
              ? invoice.dueDate.toISOString().slice(0, 10)
              : "-",
          },
          {
            label: "Total",
            value: `${invoice.currency} ${Number(invoice.totalAmount).toFixed(2)}`,
          },
          {
            label: "Balance Due",
            value: `${invoice.currency} ${Number(invoice.balanceDue).toFixed(2)}`,
          },
        ],
      };
    }

    if (type === "DELIVERY_NOTE") {
      const delivery = await this.prisma.deliveryNote.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          deliveryNumber: true,
          status: true,
          dispatchDate: true,
          deliveredAt: true,
          receiver: true,
          customer: { select: { companyName: true } },
        },
      });
      if (!delivery) throw new NotFoundException("Delivery note not found");
      return {
        item: {
          type,
          id: delivery.id,
          label: delivery.deliveryNumber,
          subtitle: delivery.customer.companyName,
          route: "/delivery-notes",
        },
        details: [
          { label: "Customer", value: delivery.customer.companyName },
          { label: "Status", value: delivery.status },
          {
            label: "Dispatch Date",
            value: delivery.dispatchDate
              ? delivery.dispatchDate.toISOString().slice(0, 10)
              : "-",
          },
          {
            label: "Delivered At",
            value: delivery.deliveredAt
              ? delivery.deliveredAt.toISOString().slice(0, 10)
              : "-",
          },
          { label: "Receiver", value: delivery.receiver ?? "-" },
        ],
      };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        paymentNumber: true,
        method: true,
        amount: true,
        paidAt: true,
        reference: true,
        customer: { select: { companyName: true } },
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    return {
      item: {
        type,
        id: payment.id,
        label: payment.paymentNumber,
        subtitle: payment.customer.companyName,
        route: "/payments",
      },
      details: [
        { label: "Customer", value: payment.customer.companyName },
        { label: "Method", value: payment.method },
        { label: "Amount", value: Number(payment.amount).toFixed(2) },
        { label: "Paid At", value: payment.paidAt.toISOString().slice(0, 10) },
        { label: "Reference", value: payment.reference ?? "-" },
      ],
    };
  }
}
