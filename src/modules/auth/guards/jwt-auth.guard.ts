import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AuthTokenPayload } from "../auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Authentication token is required");
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException("Invalid authentication token");
    }

    try {
      const payload = this.jwtService.verify<AuthTokenPayload>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException(
        "Invalid or expired authentication token",
      );
    }
  }
}
