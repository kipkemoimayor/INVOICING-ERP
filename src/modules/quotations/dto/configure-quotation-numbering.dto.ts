import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class ConfigureQuotationNumberingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startFrom: number;
}
