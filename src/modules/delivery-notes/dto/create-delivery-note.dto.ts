import { Type } from "class-transformer";
import { DeliveryStatus } from "@prisma-client";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateDeliveryNoteDto {
  @IsUUID()
  invoiceId: string;

  @IsOptional()
  @IsDateString()
  dispatchDate?: string;

  @IsOptional()
  @IsString()
  receiver?: string;

  @IsString()
  comments: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}
