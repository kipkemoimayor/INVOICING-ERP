import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuditAction, UserStatus } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DataAccessService } from "../../data-access/data-access.service";
import { RbacService } from "../rbac/rbac.service";
import { BootstrapAdminDto } from "./dto/bootstrap-admin.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: DataAccessService,
    private readonly jwtService: JwtService,
    private readonly rbacService: RbacService,
  ) {}

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash || !storedHash.includes(":")) {
      return false;
    }
    const [salt, expectedHashHex] = storedHash.split(":");
    if (!salt || !expectedHashHex) {
      return false;
    }
    const computed = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHashHex, "hex");
    if (expected.length !== computed.length) {
      return false;
    }
    return timingSafeEqual(expected, computed);
  }

  async getBootstrapStatus() {
    const activeUsers = await this.prisma.user.count({
      where: {
        deletedAt: null,
      },
    });
    return {
      canBootstrapAdmin: activeUsers === 0,
    };
  }

  async bootstrapAdmin(dto: BootstrapAdminDto) {
    const activeUsers = await this.prisma.user.count({
      where: {
        deletedAt: null,
      },
    });
    if (activeUsers > 0) {
      throw new BadRequestException(
        "Bootstrap is only allowed when no users exist",
      );
    }

    await this.rbacService.listPermissions();
    const allPermissions = await this.prisma.permission.findMany({
      select: { id: true },
    });

    const adminRole = await this.prisma.role.upsert({
      where: { name: "Admin" },
      update: {
        rolePermissions: {
          deleteMany: {},
          createMany: {
            data: allPermissions.map((permission) => ({
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          },
        },
      },
      create: {
        name: "Admin",
        description: "System administrator with full access",
        isSystem: true,
        rolePermissions: {
          create: allPermissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
      select: { id: true, name: true },
    });

    const email = dto.email.trim().toLowerCase();
    await this.prisma.user.create({
      data: {
        email,
        passwordHash: this.hashPassword(dto.password),
        firstName: dto.firstName?.trim() || "System",
        lastName: dto.lastName?.trim() || "Administrator",
        status: UserStatus.ACTIVE,
        userRoles: {
          create: [{ roleId: adminRole.id }],
        },
      },
      select: { id: true },
    });

    return {
      message: "Admin account bootstrapped successfully",
      email,
      role: adminRole.name,
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        passwordHash: true,
        userRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        "Your account is not active. Please contact administrator.",
      );
    }

    const roleNames = user.userRoles.map((x) => x.role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((x) =>
          x.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];
    const payload = {
      sub: user.id,
      email: user.email,
      roles: roleNames,
      permissions,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.LOGIN,
        resourceType: "AUTH",
        resourceId: user.id,
        message: `User ${user.email} logged in`,
        actorUserId: user.id,
      },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        roles: roleNames,
        permissions,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException("User account not found");
    }

    const roles = user.userRoles.map((x) => x.role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((x) =>
          x.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles,
      permissions,
    };
  }

  async logout(userId: string) {
    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.LOGOUT,
        resourceType: "AUTH",
        resourceId: userId,
        message: "User logged out",
        actorUserId: userId,
      },
    });
    return { message: "Logged out successfully" };
  }
}
