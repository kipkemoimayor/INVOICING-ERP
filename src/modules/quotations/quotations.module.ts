import { Module } from "@nestjs/common";
import { QuotationsController } from "./quotations.controller";
import { QuotationsService } from "./quotations.service";
import { DataAccessModule } from "../../data-access/data-access.module";
import { SettingsModule } from "../settings/settings.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [DataAccessModule, SettingsModule, EmailModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
