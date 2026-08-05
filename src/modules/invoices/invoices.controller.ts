import {
  Body,
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { InvoicesService } from "./invoices.service";
import { QueryInvoicesDto } from "./dto/query-invoices.dto";
import { ConfigureInvoiceNumberingDto } from "./dto/configure-invoice-numbering.dto";
import { RecordInvoicePaymentDto } from "./dto/record-invoice-payment.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { UpdateInvoiceStatusDto } from "./dto/update-invoice-status.dto";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@Query() query: QueryInvoicesDto) {
    return this.invoicesService.findAll(query);
  }

  @Get("payments/:paymentId/proof")
  async getPaymentProof(
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const proof = await this.invoicesService.getPaymentProof(paymentId);
    res.setHeader("Content-Type", proof.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${proof.filename}"`,
    );
    return new StreamableFile(proof.stream);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get(":id/pdf")
  async generatePdf(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.invoicesService.generatePdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, dto);
  }

  @Patch(":id/status")
  @UseInterceptors(
    FileInterceptor("attachment", {
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              "Attachment must be PDF, image, DOC, or DOCX file",
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @UploadedFile()
    attachment?: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    return this.invoicesService.updateStatus(id, dto, attachment);
  }

  @Post(":id/payments")
  @UseInterceptors(
    FileInterceptor("proof", {
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
        ];
        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              "Proof must be PDF, PNG, JPEG, or WEBP file",
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  recordPayment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RecordInvoicePaymentDto,
    @UploadedFile() proof?: { buffer: Buffer; mimetype: string },
  ) {
    return this.invoicesService.recordPayment(id, dto, proof);
  }

  @Post("numbering/start")
  configureNumbering(@Body() dto: ConfigureInvoiceNumberingDto) {
    return this.invoicesService.configureNumberingStart(dto.startFrom);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.invoicesService.remove(id);
  }
}
