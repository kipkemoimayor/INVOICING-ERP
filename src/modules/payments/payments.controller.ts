import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { QueryPaymentStatementDto } from "./dto/query-payment-statement.dto";
import { QueryPaymentsDto } from "./dto/query-payments.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query() query: QueryPaymentsDto) {
    return this.paymentsService.findAll(query);
  }

  @Get("export")
  async exportExcel(
    @Query() query: QueryPaymentsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.paymentsService.exportExcel(query);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Get("statement")
  getStatement(@Query() query: QueryPaymentStatementDto) {
    return this.paymentsService.getStatement(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.paymentsService.findOne(id);
  }

  @Get(":id/proof")
  async getProof(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const proof = await this.paymentsService.getProof(id);
    res.setHeader("Content-Type", proof.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${proof.filename}"`,
    );
    return new StreamableFile(proof.stream);
  }

  @Post()
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
  create(
    @Body() dto: CreatePaymentDto,
    @UploadedFile() proof?: { buffer: Buffer; mimetype: string },
  ) {
    return this.paymentsService.create(dto, proof);
  }

  @Delete(":id")
  reverse(@Param("id", ParseUUIDPipe) id: string) {
    return this.paymentsService.reverse(id);
  }
}
