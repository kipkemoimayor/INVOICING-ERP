import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, Max, Min } from "class-validator";

export class QueryEmailReportDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["SUCCESS", "FAILED"])
  status?: "SUCCESS" | "FAILED";
}
