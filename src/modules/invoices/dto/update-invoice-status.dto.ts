import { InvoiceStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class UpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;

  @IsOptional()
  @IsIn(["LPO", "DELIVERY_NOTE"])
  approvalDocumentType?: "LPO" | "DELIVERY_NOTE";

  @IsOptional()
  @IsString()
  approvalComments?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approvalAmount?: number;
}
