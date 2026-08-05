import { Module } from "@nestjs/common";
import { DeliveryNotesController } from "./delivery-notes.controller";
import { DeliveryNotesService } from "./delivery-notes.service";
import { DataAccessModule } from "../../data-access/data-access.module";

@Module({
  imports: [DataAccessModule],
  controllers: [DeliveryNotesController],
  providers: [DeliveryNotesService],
  exports: [DeliveryNotesService],
})
export class DeliveryNotesModule {}
