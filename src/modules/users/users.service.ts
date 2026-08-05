import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma-client";
import { randomBytes, scryptSync } from "crypto";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { CreateUserDto } from "./dto/create-user.dto";
import { QueryUsersDto } from "./dto/query-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: DataAccessService) {}

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  private buildWhere(query: QueryUsersDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };
    if (query.status) {
      where.status = query.status;
    }
    if (query.roleId) {
      where.userRoles = {
        some: { roleId: query.roleId },
      };
    }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: "insensitive" } },
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
      ];
    }
    return where;
  }

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
      },
    });
  }

  async findAll(query: QueryUsersDto) {
    const limit = query.limit ?? DEFAULTS.defaultDBpageSize;
    const skip = query.skip ?? DEFAULTS.defaultDBpage;
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, limit, skip };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  private async assertRolesExist(roleIds: string[] | undefined) {
    if (!roleIds || roleIds.length === 0) {
      return;
    }
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException("One or more roles are invalid");
    }
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException("User email already exists");
    }
    await this.assertRolesExist(dto.roleIds);

    if (existing && existing.deletedAt) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            email: dto.email.trim().toLowerCase(),
            passwordHash: this.hashPassword(dto.password),
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim(),
            status: dto.status ?? UserStatus.ACTIVE,
            deletedAt: null,
            userRoles: {
              deleteMany: {},
              create:
                dto.roleIds?.map((roleId) => ({
                  roleId,
                })) ?? [],
            },
          },
          select: { id: true },
        });
        return this.findOne(updated.id);
      });
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        passwordHash: this.hashPassword(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim(),
        status: dto.status ?? UserStatus.ACTIVE,
        userRoles: {
          create:
            dto.roleIds?.map((roleId) => ({
              roleId,
            })) ?? [],
        },
      },
      select: { id: true },
    });
    return this.findOne(user.id);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    await this.assertRolesExist(dto.roleIds);

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
        select: { id: true, deletedAt: true },
      });
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new BadRequestException("User email already exists");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          email: dto.email?.trim().toLowerCase(),
          passwordHash: dto.password
            ? this.hashPassword(dto.password)
            : undefined,
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          phone: dto.phone !== undefined ? dto.phone?.trim() : undefined,
          status: dto.status,
        },
      });

      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (dto.roleIds.length > 0) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { status },
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return {
      message: `User ${user.email} deleted successfully`,
    };
  }
}
