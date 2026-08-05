import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Response } from "express";
import { ProformasService } from "./proformas.service";
import { QueryProformasDto } from "./dto/query-proformas.dto";
import { UpdateProformaDto } from "./dto/update-proforma.dto";
import { UpdateProformaStatusDto } from "./dto/update-proforma-status.dto";

@Controller("proformas")
export class ProformasController {
  constructor(private readonly proformasService: ProformasService) {}

  @Get()
  findAll(@Query() query: QueryProformasDto) {
    return this.proformasService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.proformasService.findOne(id);
  }

  @Get(":id/pdf")
  async generatePdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.proformasService.generatePdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProformaDto,
  ) {
    return this.proformasService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProformaStatusDto,
  ) {
    return this.proformasService.updateStatus(id, dto.status);
  }

  @Post(":id/convert-to-invoice")
  convertToInvoice(@Param("id", ParseUUIDPipe) id: string) {
    return this.proformasService.convertToInvoice(id);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.proformasService.remove(id);
  }
}
