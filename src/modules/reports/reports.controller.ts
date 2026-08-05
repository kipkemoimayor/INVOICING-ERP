import { Controller, Get, Query, Res, StreamableFile } from "@nestjs/common";
import { Response } from "express";
import { QueryEmailReportDto } from "./dto/query-email-report.dto";
import { QuerySalesReportDto } from "./dto/query-sales-report.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("overview")
  getOverview(@Query() query: QuerySalesReportDto) {
    return this.reportsService.getOverview(query);
  }

  @Get("sales")
  getSalesReport(@Query() query: QuerySalesReportDto) {
    return this.reportsService.getSalesReport(query);
  }

  @Get("sales/export")
  async exportSalesExcel(
    @Query() query: QuerySalesReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } =
      await this.reportsService.exportSalesExcel(query);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Get("email")
  getEmailReport(@Query() query: QueryEmailReportDto) {
    return this.reportsService.getEmailReport(query);
  }
}
