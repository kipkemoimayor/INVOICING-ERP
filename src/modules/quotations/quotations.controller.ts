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
import { QuotationsService } from "./quotations.service";
import { CreateQuotationDto } from "./dto/create-quotation.dto";
import { QueryQuotationsDto } from "./dto/query-quotations.dto";
import { UpdateQuotationDto } from "./dto/update-quotation.dto";
import { UpdateQuotationStatusDto } from "./dto/update-quotation-status.dto";
import { ConfigureQuotationNumberingDto } from "./dto/configure-quotation-numbering.dto";

@Controller("quotations")
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Post()
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryQuotationsDto) {
    return this.quotationsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.quotationsService.findOne(id);
  }

  @Get(":id/pdf")
  async generatePdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.quotationsService.generatePdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotationsService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationStatusDto,
  ) {
    return this.quotationsService.updateStatus(id, dto.status);
  }

  @Post(":id/convert-to-proforma")
  convertToProforma(@Param("id", ParseUUIDPipe) id: string) {
    return this.quotationsService.convertToProforma(id);
  }

  @Post(":id/convert-to-invoice")
  convertToInvoice(@Param("id", ParseUUIDPipe) id: string) {
    return this.quotationsService.convertToInvoice(id);
  }

  @Post(":id/resend-email")
  resendEmail(@Param("id", ParseUUIDPipe) id: string) {
    return this.quotationsService.resendEmail(id);
  }

  @Post("numbering/start")
  configureNumbering(@Body() dto: ConfigureQuotationNumberingDto) {
    return this.quotationsService.configureNumberingStart(dto.startFrom);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.quotationsService.remove(id);
  }
}
