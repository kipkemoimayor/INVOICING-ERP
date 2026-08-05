import { Module } from "@nestjs/common";
import { ProformasController } from "./proformas.controller";
import { ProformasService } from "./proformas.service";
import { DataAccessModule } from "../../data-access/data-access.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [DataAccessModule, SettingsModule],
  controllers: [ProformasController],
  providers: [ProformasService],
})
export class ProformasModule {}
