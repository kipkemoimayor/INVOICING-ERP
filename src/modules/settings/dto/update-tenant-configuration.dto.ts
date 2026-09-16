import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class UpdateTenantConfigurationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  postalAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  physicalAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxPin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kraPin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankAccountNumber?: string;

  @IsOptional()
  @IsEnum({ TILL: "TILL", PAYBILL: "PAYBILL" })
  mpesaAccountType?: "TILL" | "PAYBILL";

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mpesaTillNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mpesaPaybillNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mpesaAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preparedByLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lpoLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  commentsLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultTaxPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  quotationNumberStart?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  defaultTerms?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  skipProforma?: boolean;
}
