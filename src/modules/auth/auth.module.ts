import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataAccessModule } from "../../data-access/data-access.module";
import { RbacModule } from "../rbac/rbac.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    ConfigModule,
    DataAccessModule,
    RbacModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresInSecondsRaw = configService.get<string>(
          "JWT_EXPIRES_IN_SECONDS",
        );
        const expiresInSeconds = Number(expiresInSecondsRaw || "28800");
        return {
          secret:
            configService.get<string>("JWT_SECRET") ||
            "dev-jwt-secret-change-me",
          signOptions: {
            expiresIn: Number.isFinite(expiresInSeconds)
              ? expiresInSeconds
              : 28800,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
