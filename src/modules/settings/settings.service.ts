import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentType, Prisma, TenantConfiguration } from "@prisma/client";
import { DataAccessService } from "../../data-access/data-access.service";
import { DEFAULTS } from "../../defaults";
import { UpdateTenantConfigurationDto } from "./dto/update-tenant-configuration.dto";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: DataAccessService) {}

  async getTenantConfiguration(): Promise<TenantConfiguration> {
    const config = await this.prisma.tenantConfiguration.findUnique({
      where: { tenantKey: "default" },
    });

    if (config) {
      return config;
    }

    return this.prisma.tenantConfiguration.create({
      data: {
        tenantKey: "default",
        companyName: "Your Company Name",
        defaultCurrency: "KSH",
        defaultTaxPercent: 16,
        quotationNumberStart: DEFAULTS.quotationNumberStart,
        skipProforma: false,
      },
    });
  }

  async updateTenantConfiguration(
    dto: UpdateTenantConfigurationDto,
  ): Promise<TenantConfiguration> {
    await this.getTenantConfiguration();
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.TenantConfigurationUpdateInput = {};
      if (dto.companyName !== undefined)
        data.companyName = dto.companyName.trim();
      if (dto.tradeName !== undefined) data.tradeName = dto.tradeName.trim();
      if (dto.tagline !== undefined) data.tagline = dto.tagline.trim();
      if (dto.postalAddress !== undefined)
        data.postalAddress = dto.postalAddress.trim();
      if (dto.physicalAddress !== undefined)
        data.physicalAddress = dto.physicalAddress.trim();
      if (dto.city !== undefined) data.city = dto.city.trim();
      if (dto.phone !== undefined) data.phone = dto.phone.trim();
      if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
      if (dto.website !== undefined) data.website = dto.website.trim();
      if (dto.preparedByLabel !== undefined)
        data.preparedByLabel = dto.preparedByLabel.trim();
      if (dto.lpoLabel !== undefined) data.lpoLabel = dto.lpoLabel.trim();
      if (dto.commentsLabel !== undefined)
        data.commentsLabel = dto.commentsLabel.trim();
      if (dto.defaultCurrency !== undefined)
        data.defaultCurrency = dto.defaultCurrency.trim().toUpperCase();
      if (dto.defaultTaxPercent !== undefined)
        data.defaultTaxPercent = dto.defaultTaxPercent;
      if (dto.defaultTerms !== undefined)
        data.defaultTerms = dto.defaultTerms.trim();
      if (dto.skipProforma !== undefined) data.skipProforma = dto.skipProforma;
      if (dto.quotationNumberStart !== undefined) {
        const existingSequence = await tx.documentSequence.findUnique({
          where: {
            uq_document_sequences_type_year: {
              documentType: DocumentType.QUOTATION,
              year: 0,
            },
          },
        });
        if (
          existingSequence &&
          dto.quotationNumberStart <= existingSequence.lastNumber
        ) {
          throw new BadRequestException(
            `Quotation number must be greater than ${existingSequence.lastNumber}`,
          );
        }
        data.quotationNumberStart = dto.quotationNumberStart;
        await tx.documentSequence.upsert({
          where: {
            uq_document_sequences_type_year: {
              documentType: DocumentType.QUOTATION,
              year: 0,
            },
          },
          update: {
            lastNumber: dto.quotationNumberStart - 1,
            prefix: "NUM",
          },
          create: {
            documentType: DocumentType.QUOTATION,
            year: 0,
            prefix: "NUM",
            lastNumber: dto.quotationNumberStart - 1,
          },
        });
      }

      return tx.tenantConfiguration.update({
        where: { tenantKey: "default" },
        data,
      });
    });
  }

  async setLogoPath(logoPath: string): Promise<TenantConfiguration> {
    await this.getTenantConfiguration();
    return this.prisma.tenantConfiguration.update({
      where: { tenantKey: "default" },
      data: {
        logoPath,
      },
    });
  }

  async getLogoPath(): Promise<string> {
    const config = await this.getTenantConfiguration();
    if (!config.logoPath) {
      throw new NotFoundException("Tenant logo not configured");
    }
    return config.logoPath;
  }
}
