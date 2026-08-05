import { IsString, IsUUID, MaxLength } from "class-validator";

export class AddCustomerNoteDto {
  @IsString()
  note: string;

  @IsUUID()
  @MaxLength(36)
  createdById: string;
}
