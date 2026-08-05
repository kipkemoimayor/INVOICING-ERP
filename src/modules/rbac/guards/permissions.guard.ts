import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "../../auth/decorators/public.decorator";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private mapModule(path: string): string | null {
    const [module] = path.split("/");
    switch (module) {
      case "dashboard":
        return "dashboard";
      case "customers":
        return "customers";
      case "products":
        return "products";
      case "quotations":
        return "quotations";
      case "proformas":
        return "proformas";
      case "invoices":
        return "invoices";
      case "delivery-notes":
        return "delivery_notes";
      case "payments":
        return "payments";
      case "reports":
        return "reports";
      case "users":
        return "users";
      case "roles":
        return "roles";
      case "settings":
        return "settings";
      case "audit-logs":
        return "audit_logs";
      default:
        return null;
    }
  }

  private derivePermission(request: Request): string | null {
    const method = request.method.toUpperCase();
    const sanitizedPath = request.path
      .replace(/^\/api\/?/, "")
      .replace(/^\/+/, "");
    const normalized = sanitizedPath.toLowerCase();

    if (!normalized || normalized.startsWith("auth/")) {
      return null;
    }

    if (normalized.startsWith("payments/statement")) {
      return "payments.statement";
    }
    if (normalized.startsWith("payments/export")) {
      return "payments.export";
    }
    if (normalized.startsWith("reports/") && normalized.includes("/export")) {
      return "reports.export";
    }
    if (normalized.startsWith("settings/")) {
      return method === "GET" ? "settings.view" : "settings.update";
    }
    if (
      normalized.includes("/resend-email") ||
      normalized.includes("/send-email")
    ) {
      return "quotations.send";
    }
    if (normalized.includes("/convert-to-")) {
      if (normalized.startsWith("quotations/")) {
        return "quotations.convert";
      }
      if (normalized.startsWith("proformas/")) {
        return "proformas.update";
      }
    }
    if (normalized.startsWith("invoices/") && normalized.includes("/status")) {
      return "invoices.approve";
    }
    if (normalized.startsWith("proformas/") && normalized.includes("/status")) {
      return "proformas.approve";
    }
    if (
      normalized.startsWith("invoices/") &&
      normalized.includes("/payments")
    ) {
      return "payments.create";
    }

    const moduleCode = this.mapModule(normalized);
    if (!moduleCode) {
      return null;
    }

    if (method === "GET") return `${moduleCode}.view`;
    if (method === "POST") return `${moduleCode}.create`;
    if (method === "PATCH" || method === "PUT") return `${moduleCode}.update`;
    if (method === "DELETE") return `${moduleCode}.delete`;
    return null;
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const explicitPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const requiredPermissions =
      explicitPermissions.length > 0
        ? explicitPermissions
        : (() => {
            const derived = this.derivePermission(request);
            return derived ? [derived] : [];
          })();

    if (requiredPermissions.length === 0) {
      return true;
    }

    const userPermissions = new Set(user.permissions ?? []);
    const allowed = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Missing required permission: ${requiredPermissions.join(", ")}`,
      );
    }
    return true;
  }
}
