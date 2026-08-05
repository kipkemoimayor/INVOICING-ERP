import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Unauthorized");
    }

    const token = authHeader.slice(7).trim();
    const apiKey = this.configService.get<string>("API_KEY");

    if (!apiKey) {
      throw new UnauthorizedException(
        "API_KEY is not configured on the server",
      );
    }

    if (token !== apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }
}
