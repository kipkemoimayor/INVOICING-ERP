import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { CreateRoleDto } from "./dto/create-role.dto";
import { QueryRolesDto } from "./dto/query-roles.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class RbacService {
  constructor(private readonly prisma: DataAccessService) {}

  private readonly defaultPermissions: Array<{
    code: string;
    name: string;
    description: string;
  }> = [
    {
      code: "dashboard.view",
      name: "View Dashboard",
      description: "View dashboard analytics and summary cards",
    },
    {
      code: "customers.view",
      name: "View Customers",
      description: "View customers and customer profiles",
    },
    {
      code: "customers.create",
      name: "Create Customers",
      description: "Create new customer records",
    },
    {
      code: "customers.update",
      name: "Update Customers",
      description: "Edit existing customer records",
    },
    {
      code: "customers.delete",
      name: "Delete Customers",
      description: "Delete or archive customer records",
    },
    {
      code: "products.view",
      name: "View Products",
      description: "View product catalog and stock details",
    },
    {
      code: "products.create",
      name: "Create Products",
      description: "Create product records",
    },
    {
      code: "products.update",
      name: "Update Products",
      description: "Edit product records",
    },
    {
      code: "products.delete",
      name: "Delete Products",
      description: "Delete or archive product records",
    },
    {
      code: "quotations.view",
      name: "View Quotations",
      description: "View quotations and quotation lines",
    },
    {
      code: "quotations.create",
      name: "Create Quotations",
      description: "Create new quotations",
    },
    {
      code: "quotations.update",
      name: "Update Quotations",
      description: "Edit draft quotations",
    },
    {
      code: "quotations.send",
      name: "Send Quotations",
      description: "Send quotations to customers by email",
    },
    {
      code: "quotations.convert",
      name: "Convert Quotations",
      description: "Convert accepted quotations to proforma or invoice",
    },
    {
      code: "proformas.view",
      name: "View Proformas",
      description: "View proforma invoices",
    },
    {
      code: "proformas.create",
      name: "Create Proformas",
      description: "Create and generate proforma invoices",
    },
    {
      code: "proformas.update",
      name: "Update Proformas",
      description: "Edit proforma invoices before approval",
    },
    {
      code: "proformas.approve",
      name: "Approve Proformas",
      description: "Approve proformas for payment flow",
    },
    {
      code: "invoices.view",
      name: "View Invoices",
      description: "View tax invoices and balances",
    },
    {
      code: "invoices.create",
      name: "Create Invoices",
      description: "Create and generate tax invoices",
    },
    {
      code: "invoices.update",
      name: "Update Invoices",
      description: "Edit draft invoices",
    },
    {
      code: "invoices.approve",
      name: "Approve Invoices",
      description: "Approve invoices and trigger workflow actions",
    },
    {
      code: "invoices.email",
      name: "Email Invoices",
      description: "Send invoices to customers by email",
    },
    {
      code: "delivery_notes.view",
      name: "View Delivery Notes",
      description: "View delivery notes and delivery status",
    },
    {
      code: "delivery_notes.create",
      name: "Create Delivery Notes",
      description: "Create delivery notes manually or from invoice flow",
    },
    {
      code: "delivery_notes.update",
      name: "Update Delivery Notes",
      description: "Update delivery status and receiver details",
    },
    {
      code: "payments.view",
      name: "View Payments",
      description: "View payment records and proofs",
    },
    {
      code: "payments.create",
      name: "Record Payments",
      description: "Record invoice or proforma payments",
    },
    {
      code: "payments.reverse",
      name: "Reverse Payments",
      description: "Reverse existing payments",
    },
    {
      code: "payments.delete",
      name: "Delete Payments",
      description: "Delete existing payments",
    },
    {
      code: "payments.statement",
      name: "Generate Statements",
      description: "Generate payment statements within allowed ranges",
    },
    {
      code: "payments.export",
      name: "Export Payments",
      description: "Export payments report to Excel",
    },
    {
      code: "inventory.view",
      name: "View Inventory",
      description: "View stock levels and movement history",
    },
    {
      code: "inventory.adjust",
      name: "Adjust Inventory",
      description: "Perform inventory adjustments",
    },
    {
      code: "reports.view",
      name: "View Reports",
      description: "View system reports and report dashboards",
    },
    {
      code: "reports.export",
      name: "Export Reports",
      description: "Export report datasets to files",
    },
    {
      code: "users.view",
      name: "View Users",
      description: "View user accounts and role assignments",
    },
    {
      code: "users.create",
      name: "Create Users",
      description: "Create user accounts",
    },
    {
      code: "users.update",
      name: "Update Users",
      description: "Edit user profile and assignment details",
    },
    {
      code: "users.delete",
      name: "Delete Users",
      description: "Delete or deactivate user accounts",
    },
    {
      code: "roles.view",
      name: "View Roles",
      description: "View roles and permissions",
    },
    {
      code: "roles.create",
      name: "Create Roles",
      description: "Create custom roles",
    },
    {
      code: "roles.update",
      name: "Update Roles",
      description: "Edit role details and permissions",
    },
    {
      code: "roles.delete",
      name: "Delete Roles",
      description: "Delete removable roles",
    },
    {
      code: "settings.view",
      name: "View Settings",
      description: "View tenant and system settings",
    },
    {
      code: "settings.update",
      name: "Update Settings",
      description: "Update tenant and workflow settings",
    },
    {
      code: "audit_logs.view",
      name: "View Audit Logs",
      description: "View audit trail and system actions",
    },
  ];

  private async ensureDefaultPermissions() {
    await this.prisma.permission.createMany({
      data: this.defaultPermissions,
      skipDuplicates: true,
    });
  }

  async listPermissions(search?: string) {
    await this.ensureDefaultPermissions();
    return this.prisma.permission.findMany({
      where: search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
      },
    });
  }

  private buildWhere(query: QueryRolesDto): Prisma.RoleWhereInput {
    if (!query.search) {
      return {};
    }
    return {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }

  async findAll(query: QueryRolesDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          isSystem: true,
          createdAt: true,
          updatedAt: true,
          rolePermissions: {
            select: {
              permission: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              userRoles: true,
            },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      data: data.map((role) => ({
        ...role,
        permissions: role.rolePermissions.map((rp) => rp.permission),
      })),
      total,
      limit,
      skip,
    };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
        rolePermissions: {
          select: {
            permission: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
              },
            },
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }

    return {
      ...role,
      permissions: role.rolePermissions.map((rp) => rp.permission),
    };
  }

  private async assertPermissionsExist(permissionIds: string[] | undefined) {
    if (!permissionIds || permissionIds.length === 0) {
      return;
    }

    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true },
    });
    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException("One or more permissions are invalid");
    }
  }

  async create(dto: CreateRoleDto) {
    await this.assertPermissionsExist(dto.permissionIds);

    const normalizedName = dto.name.trim();
    const existing = await this.prisma.role.findFirst({
      where: { name: { equals: normalizedName, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("Role name already exists");
    }

    const role = await this.prisma.role.create({
      data: {
        name: normalizedName,
        description: dto.description?.trim() || null,
        rolePermissions: {
          create:
            dto.permissionIds?.map((permissionId) => ({ permissionId })) ?? [],
        },
      },
      select: { id: true },
    });
    return this.findOne(role.id);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }

    await this.assertPermissionsExist(dto.permissionIds);

    if (dto.name && dto.name.trim().toLowerCase() !== role.name.toLowerCase()) {
      const existing = await this.prisma.role.findFirst({
        where: {
          name: { equals: dto.name.trim(), mode: "insensitive" },
          id: { not: id },
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException("Role name already exists");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description:
            dto.description !== undefined
              ? dto.description.trim() || null
              : undefined,
        },
      });

      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (dto.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isSystem: true,
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    if (role.isSystem) {
      throw new BadRequestException("System roles cannot be deleted");
    }
    if (role._count.userRoles > 0) {
      throw new BadRequestException(
        "Role cannot be deleted while assigned to users",
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return {
      message: `Role ${role.name} deleted successfully`,
    };
  }
}
