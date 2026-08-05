import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { AuthenticatedUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { BootstrapAdminDto } from "./dto/bootstrap-admin.dto";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Get("bootstrap-status")
  getBootstrapStatus() {
    return this.authService.getBootstrapStatus();
  }

  @Public()
  @Post("bootstrap-admin")
  bootstrapAdmin(@Body() dto: BootstrapAdminDto) {
    return this.authService.bootstrapAdmin(dto);
  }

  @Get("me")
  me(@CurrentUser() user?: AuthenticatedUser) {
    if (!user?.sub) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.authService.me(user?.sub ?? "");
  }

  @Post("logout")
  logout(@CurrentUser() user?: AuthenticatedUser) {
    if (!user?.sub) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.authService.logout(user?.sub ?? "");
  }
}
