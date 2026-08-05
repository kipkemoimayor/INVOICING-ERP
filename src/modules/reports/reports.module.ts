import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { DataAccessModule } from "../../data-access/data-access.module";

@Module({
  imports: [DataAccessModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
