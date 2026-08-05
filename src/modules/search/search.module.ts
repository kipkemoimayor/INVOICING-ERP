import { Module } from "@nestjs/common";
import { DataAccessModule } from "../../data-access/data-access.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [DataAccessModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
