import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { DataAccessModule } from "../../data-access/data-access.module";
import { SettingsModule } from "../settings/settings.module";
import { EmailModule } from "../email/email.module";
import { DeliveryNotesModule } from "../delivery-notes/delivery-notes.module";

@Module({
  imports: [DataAccessModule, SettingsModule, EmailModule, DeliveryNotesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
