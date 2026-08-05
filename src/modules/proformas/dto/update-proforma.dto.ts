import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProformaDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
