import { IsEnum } from "class-validator";
import { ProformaStatus } from "@prisma/client";

export class UpdateProformaStatusDto {
  @IsEnum(ProformaStatus)
  status: ProformaStatus;
}
