import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../rbac/decorators/permissions.decorator";
import { QueryGlobalSearchDto } from "./dto/query-global-search.dto";
import { QueryQuickViewDto } from "./dto/query-quick-view.dto";
import { SearchService } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("global")
  @RequirePermissions("dashboard.view")
  globalSearch(@Query() query: QueryGlobalSearchDto) {
    return this.searchService.globalSearch(query);
  }

  @Get("quick-view")
  @RequirePermissions("dashboard.view")
  quickView(@Query() query: QueryQuickViewDto) {
    return this.searchService.quickView(query);
  }
}
