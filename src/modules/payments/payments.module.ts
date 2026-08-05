import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { DataAccessModule } from "../../data-access/data-access.module";
import { InvoicesModule } from "../invoices/invoices.module";

@Module({
  imports: [DataAccessModule, InvoicesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
