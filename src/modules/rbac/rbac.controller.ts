import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CreateRoleDto } from "./dto/create-role.dto";
import { QueryRolesDto } from "./dto/query-roles.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RbacService } from "./rbac.service";

@Controller("roles")
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get("permissions")
  listPermissions(@Query("search") search?: string) {
    return this.rbacService.listPermissions(search);
  }

  @Get()
  findAll(@Query() query: QueryRolesDto) {
    return this.rbacService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.rbacService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.rbacService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rbacService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.rbacService.remove(id);
  }
}
