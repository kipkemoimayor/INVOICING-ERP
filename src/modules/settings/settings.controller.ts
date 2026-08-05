import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { extname, join } from "path";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs";
import { Response } from "express";
import { SettingsService } from "./settings.service";
import { UpdateTenantConfigurationDto } from "./dto/update-tenant-configuration.dto";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("tenant")
  getTenantConfiguration() {
    return this.settingsService.getTenantConfiguration();
  }

  @Patch("tenant")
  updateTenantConfiguration(@Body() dto: UpdateTenantConfigurationDto) {
    return this.settingsService.updateTenantConfiguration(dto);
  }

  @Post("tenant/logo")
  @UseInterceptors(
    FileInterceptor("logo", {
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          cb(new BadRequestException("Logo must be an image file"), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadLogo(
    @UploadedFile() file: { originalname: string; buffer?: Buffer } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("Logo file is required");
    }
    if (!file.buffer) {
      throw new BadRequestException("Invalid logo upload");
    }

    const uploadDir = join(process.cwd(), "uploads", "tenant");
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    const extension = extname(file.originalname || ".png") || ".png";
    const filename = `tenant-logo-${Date.now()}${extension}`;
    const absolutePath = join(uploadDir, filename);
    writeFileSync(absolutePath, file.buffer);

    const relativePath = join("uploads", "tenant", filename);
    const normalized = relativePath.replace(/\\/g, "/");
    await this.settingsService.setLogoPath(normalized);
    return { logoPath: normalized };
  }

  @Get("tenant/logo")
  async getLogo(@Res({ passthrough: true }) res: Response) {
    const logoPath = await this.settingsService.getLogoPath();
    const absolutePath = join(process.cwd(), logoPath);
    const extension = extname(absolutePath).toLowerCase();
    const contentType =
      extension === ".svg"
        ? "image/svg+xml"
        : extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : extension === ".webp"
            ? "image/webp"
            : "image/png";

    res.setHeader("Content-Type", contentType);
    return new StreamableFile(createReadStream(absolutePath));
  }
}
