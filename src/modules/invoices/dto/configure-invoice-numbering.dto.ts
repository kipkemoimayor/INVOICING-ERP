import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class ConfigureInvoiceNumberingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startFrom: number;
}
