import { Type } from "class-transformer";
import { DeliveryStatus } from "@prisma-client";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class QueryDeliveryNotesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}
