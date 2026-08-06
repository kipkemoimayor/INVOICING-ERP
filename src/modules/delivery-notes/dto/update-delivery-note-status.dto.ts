import { DeliveryStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateDeliveryNoteStatusDto {
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}
