import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  DeliveryStatus,
  DocumentType,
  InvoiceStatus,
  Prisma,
} from "@prisma-client";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { CreateDeliveryNoteDto } from "./dto/create-delivery-note.dto";
import { QueryDeliveryNotesDto } from "./dto/query-delivery-notes.dto";

@Injectable()
export class DeliveryNotesService {
  constructor(private readonly prisma: DataAccessService) {}

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

  private async generateDeliveryNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const sequence = await tx.documentSequence.upsert({
      where: {
        uq_document_sequences_type_year: {
          documentType: DocumentType.DELIVERY_NOTE,
          year,
        },
      },
      update: {
        lastNumber: { increment: 1 },
      },
      create: {
        documentType: DocumentType.DELIVERY_NOTE,
        year,
        prefix: "DN",
        lastNumber: 1,
      },
    });

    return `DN-${year}-${sequence.lastNumber.toString().padStart(6, "0")}`;
  }

  private saveAttachmentFile(attachment: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }) {
    const uploadDir = join(process.cwd(), "uploads", "delivery-notes");
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
    const fileName = `delivery-note-${Date.now()}${extension}`;
    const absolutePath = join(uploadDir, fileName);
    writeFileSync(absolutePath, attachment.buffer);
    return {
      fileName: attachment.originalname?.trim() || fileName,
      mimeType: attachment.mimetype,
      sizeBytes: attachment.size ?? attachment.buffer.byteLength,
      storagePath: join("uploads", "delivery-notes", fileName).replace(
        /\\/g,
        "/",
      ),
    };
  }

  private buildWhere(
    query: QueryDeliveryNotesDto,
  ): Prisma.DeliveryNoteWhereInput {
    const where: Prisma.DeliveryNoteWhereInput = {
      deletedAt: null,
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.OR = [
        { deliveryNumber: { contains: query.search, mode: "insensitive" } },
        { vehicle: { contains: query.search, mode: "insensitive" } },
        { driver: { contains: query.search, mode: "insensitive" } },
        { receiver: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
        {
          invoice: {
            invoiceNumber: { contains: query.search, mode: "insensitive" },
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

  async findAll(query: QueryDeliveryNotesDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.deliveryNote.findMany({
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
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
        },
      }),
      this.prisma.deliveryNote.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const deliveryNote = await this.prisma.deliveryNote.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        invoice: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!deliveryNote) {
      throw new NotFoundException(`Delivery note with id ${id} not found`);
    }
    const attachments = await this.prisma.fileAsset.findMany({
      where: {
        documentType: DocumentType.DELIVERY_NOTE,
        documentId: id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        storagePath: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    return {
      ...deliveryNote,
      attachments,
    };
  }

  async create(
    dto: CreateDeliveryNoteDto,
    attachment?: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    const invoice = await this.prisma.taxInvoice.findFirst({
      where: { id: dto.invoiceId, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        status: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with id ${dto.invoiceId} not found`);
    }
    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException(
        "Delivery note can only be created for approved invoices",
      );
    }
    if (!dto.comments?.trim()) {
      throw new BadRequestException("Comments are required");
    }
    if (!attachment) {
      throw new BadRequestException("Attachment is required");
    }

    const attachmentInfo = this.saveAttachmentFile(attachment);
    return this.prisma.$transaction(async (tx) => {
      const createdById = await this.ensureSystemUserId(tx);
      const deliveryNumber = await this.generateDeliveryNumber(tx);
      const created = await tx.deliveryNote.create({
        data: {
          deliveryNumber,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          status: dto.status ?? DeliveryStatus.PENDING,
          dispatchDate: dto.dispatchDate ? new Date(dto.dispatchDate) : null,
          receiver: dto.receiver?.trim(),
          notes: dto.comments.trim(),
          createdById,
        },
      });
      const fileAsset = await tx.fileAsset.create({
        data: {
          documentType: DocumentType.DELIVERY_NOTE,
          documentId: created.id,
          fileName: attachmentInfo.fileName,
          mimeType: attachmentInfo.mimeType,
          storagePath: attachmentInfo.storagePath,
          sizeBytes: attachmentInfo.sizeBytes,
          uploadedById: createdById,
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.CREATED,
          resourceType: "DELIVERY_NOTE",
          resourceId: created.id,
          message: `Delivery note ${created.deliveryNumber} created manually`,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            comments: dto.comments.trim(),
            amount: dto.amount ?? null,
            fileAssetId: fileAsset.id,
          },
        },
      });
      return created;
    });
  }

  async createFromInvoiceApproval(
    invoiceId: string,
    input: {
      comments: string;
      amount?: number;
      attachment: {
        fileName: string;
        mimeType: string;
        storagePath: string;
        sizeBytes: number;
      };
    },
  ) {
    const invoice = await this.prisma.taxInvoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        status: true,
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with id ${invoiceId} not found`);
    }
    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException(
        "Invoice must be approved before creating delivery note",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const createdById = await this.ensureSystemUserId(tx);
      const deliveryNumber = await this.generateDeliveryNumber(tx);
      const created = await tx.deliveryNote.create({
        data: {
          deliveryNumber,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          status: DeliveryStatus.PENDING,
          dispatchDate: new Date(),
          notes: input.comments.trim(),
          createdById,
        },
      });
      const fileAsset = await tx.fileAsset.create({
        data: {
          documentType: DocumentType.DELIVERY_NOTE,
          documentId: created.id,
          fileName: input.attachment.fileName,
          mimeType: input.attachment.mimeType,
          storagePath: input.attachment.storagePath,
          sizeBytes: input.attachment.sizeBytes,
          uploadedById: createdById,
        },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.CREATED,
          resourceType: "DELIVERY_NOTE",
          resourceId: created.id,
          message: `Delivery note ${created.deliveryNumber} auto-created from invoice approval`,
          metadata: {
            source: "INVOICE_APPROVAL",
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            comments: input.comments.trim(),
            amount: input.amount ?? null,
            fileAssetId: fileAsset.id,
          },
        },
      });
      return created;
    });
  }

  async updateStatus(id: string, status: DeliveryStatus) {
    const deliveryNote = await this.findOne(id);
    const validTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
      PENDING: [DeliveryStatus.DISPATCHED, DeliveryStatus.RETURNED],
      DISPATCHED: [DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED],
      DELIVERED: [],
      RETURNED: [],
    };

    if (!validTransitions[deliveryNote.status].includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${deliveryNote.status} to ${status}`,
      );
    }

    return this.prisma.deliveryNote.update({
      where: { id },
      data: {
        status,
        deliveredAt:
          status === DeliveryStatus.DELIVERED
            ? new Date()
            : deliveryNote.deliveredAt,
      },
    });
  }

  async getAttachment(id: string) {
    const asset = await this.prisma.fileAsset.findFirst({
      where: {
        documentType: DocumentType.DELIVERY_NOTE,
        documentId: id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        fileName: true,
        mimeType: true,
        storagePath: true,
      },
    });
    if (!asset) {
      throw new NotFoundException("Delivery note attachment not found");
    }
    const absolutePath = join(process.cwd(), asset.storagePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException("Attachment file is missing");
    }
    return {
      stream: createReadStream(absolutePath),
      filename: asset.fileName,
      contentType: asset.mimeType,
    };
  }
}
