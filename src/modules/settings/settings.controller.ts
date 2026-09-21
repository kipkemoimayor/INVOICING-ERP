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
import { Response } from "express";
import { uploadToBlob } from "../../utils/blob-storage";
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
    @UploadedFile()
    file: { originalname: string; buffer?: Buffer; mimetype?: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("Logo file is required");
    }
    if (!file.buffer) {
      throw new BadRequestException("Invalid logo upload");
    }

    const uploaded = await uploadToBlob(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype || "image/png",
      },
      "tenant",
    );

    await this.settingsService.setLogoPath(uploaded.url);
    return { logoPath: uploaded.url };
  }

  @Get("tenant/logo")
  async getLogo(@Res({ passthrough: true }) res: Response) {
    const logoUrl = await this.settingsService.getLogoPath();

    if (!logoUrl.startsWith("http")) {
      throw new BadRequestException("Tenant logo is not stored in a public URL");
    }

    const response = await fetch(logoUrl);
    if (!response.ok) {
      throw new BadRequestException("Tenant logo could not be fetched");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get("content-type") || "image/png";

    res.setHeader("Content-Type", contentType);
    return new StreamableFile(buffer);
  }
}
