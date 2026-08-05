import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user?: AuthenticatedUser) {
    if (!user?.sub) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.profileService.getProfile(user.sub);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpdateProfileDto,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.profileService.updateProfile(user.sub, dto);
  }

  @Post("change-password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.profileService.changePassword(user.sub, dto);
  }
}
