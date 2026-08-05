import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class QueryPaymentStatementDto {
  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
