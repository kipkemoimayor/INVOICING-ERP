import { IsEnum } from "class-validator";
import { QuotationStatus } from "@prisma-client";

export class UpdateQuotationStatusDto {
  @IsEnum(QuotationStatus)
  status: QuotationStatus;
}
