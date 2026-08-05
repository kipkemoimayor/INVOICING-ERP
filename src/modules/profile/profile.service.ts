import { AuditAction, Prisma, UserStatus } from "@prisma-client";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DataAccessService } from "../../data-access/data-access.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: DataAccessService) {}

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

  private async findActiveUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        passwordHash: true,
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
      throw new NotFoundException("Profile not found");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Account is not active");
    }
    return user;
  }

  private mapProfile(
    user: Awaited<ReturnType<ProfileService["findActiveUser"]>>,
  ) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      roles: user.userRoles.map((x) => x.role.name),
      permissions: [
        ...new Set(
          user.userRoles.flatMap((x) =>
            x.role.rolePermissions.map((rp) => rp.permission.code),
          ),
        ),
      ],
    };
  }

  async getProfile(userId: string) {
    const user = await this.findActiveUser(userId);
    return this.mapProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.findActiveUser(userId);
    if (
      dto.email &&
      dto.email.trim().toLowerCase() !== existing.email.toLowerCase()
    ) {
      const duplicate = await this.prisma.user.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
        select: { id: true, deletedAt: true },
      });
      if (duplicate && !duplicate.deletedAt && duplicate.id !== userId) {
        throw new BadRequestException("Email address is already in use");
      }
    }

    const data: Prisma.UserUpdateInput = {
      email: dto.email?.trim().toLowerCase(),
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
    };

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.UPDATED,
        resourceType: "PROFILE",
        resourceId: userId,
        message: `Profile updated for ${existing.email}`,
        actorUserId: userId,
      },
    });

    const updated = await this.findActiveUser(userId);
    return this.mapProfile(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const existing = await this.findActiveUser(userId);
    if (!this.verifyPassword(dto.currentPassword, existing.passwordHash)) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        "New password must be different from current password",
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: this.hashPassword(dto.newPassword),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.UPDATED,
        resourceType: "PROFILE_PASSWORD",
        resourceId: userId,
        message: `Password changed for ${existing.email}`,
        actorUserId: userId,
      },
    });

    return { message: "Password updated successfully" };
  }
}
