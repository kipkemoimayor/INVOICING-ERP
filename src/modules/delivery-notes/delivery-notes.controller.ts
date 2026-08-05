import {
  BadRequestException,
  Body,
  Controller,
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
import { CreateDeliveryNoteDto } from "./dto/create-delivery-note.dto";
import { QueryDeliveryNotesDto } from "./dto/query-delivery-notes.dto";
import { UpdateDeliveryNoteStatusDto } from "./dto/update-delivery-note-status.dto";
import { DeliveryNotesService } from "./delivery-notes.service";

@Controller("delivery-notes")
export class DeliveryNotesController {
  constructor(private readonly deliveryNotesService: DeliveryNotesService) {}

  @Get()
  findAll(@Query() query: QueryDeliveryNotesDto) {
    return this.deliveryNotesService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.deliveryNotesService.findOne(id);
  }

  @Get(":id/attachment")
  async getAttachment(
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const attachment = await this.deliveryNotesService.getAttachment(id);
    res.setHeader("Content-Type", attachment.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${attachment.filename}"`,
    );
    return new StreamableFile(attachment.stream);
  }

  @Post()
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
  create(
    @Body() dto: CreateDeliveryNoteDto,
    @UploadedFile()
    attachment?: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    return this.deliveryNotesService.create(dto, attachment);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryNoteStatusDto,
  ) {
    return this.deliveryNotesService.updateStatus(id, dto.status);
  }
}
