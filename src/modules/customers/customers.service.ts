import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Customer, CustomerStatus, Prisma } from "@prisma-client";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { AddCustomerNoteDto } from "./dto/add-customer-note.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { QueryCustomersDto } from "./dto/query-customers.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: DataAccessService) {}

  private async generateCustomerCode(): Promise<string> {
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const count = await this.prisma.customer.count();
      const sequence = (count + attempt + 1).toString().padStart(6, "0");
      const customerCode = `CUS-${year}-${sequence}`;
      const existing = await this.prisma.customer.findUnique({
        where: { customerCode },
        select: { id: true },
      });

      if (!existing) {
        return customerCode;
      }
    }

    throw new BadRequestException("Failed to generate unique customer code");
  }

  private buildCustomerWhere(
    query: QueryCustomersDto,
  ): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: "insensitive" } },
        { customerCode: { contains: query.search, mode: "insensitive" } },
        { contactPerson: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
      ];
    }

    return where;
  }

  private normalizeCreateInput(
    dto: CreateCustomerDto,
    customerCode: string,
  ): Prisma.CustomerCreateInput {
    return {
      customerCode,
      companyName: dto.companyName.trim(),
      contactPerson: dto.contactPerson?.trim(),
      email: dto.email?.trim().toLowerCase(),
      phone: dto.phone?.trim(),
      address: dto.address?.trim(),
      taxNumber: dto.taxNumber?.trim(),
      status: dto.status ?? CustomerStatus.ACTIVE,
      creditLimit: dto.creditLimit,
    };
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const customerCode =
      dto.customerCode?.trim() || (await this.generateCustomerCode());
    return this.prisma.customer.create({
      data: this.normalizeCreateInput(dto, customerCode),
    });
  }

  async findAll(query: QueryCustomersDto): Promise<{
    data: Customer[];
    total: number;
    limit: number;
    skip: number;
  }> {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildCustomerWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id ${id} not found`);
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        companyName: dto.companyName?.trim(),
        contactPerson: dto.contactPerson?.trim(),
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        address: dto.address?.trim(),
        taxNumber: dto.taxNumber?.trim(),
        status: dto.status,
        creditLimit: dto.creditLimit,
      },
    });
  }

  async remove(id: string): Promise<Customer> {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: CustomerStatus.INACTIVE,
      },
    });
  }

  async addNote(customerId: string, dto: AddCustomerNoteDto) {
    await this.findOne(customerId);
    return this.prisma.customerNote.create({
      data: {
        customerId,
        note: dto.note.trim(),
        createdById: dto.createdById,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async listNotes(customerId: string) {
    await this.findOne(customerId);
    return this.prisma.customerNote.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async history(customerId: string) {
    await this.findOne(customerId);
    return this.prisma.activity.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
