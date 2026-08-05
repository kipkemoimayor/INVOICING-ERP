import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
} from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { QueryCustomersDto } from "./dto/query-customers.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { AddCustomerNoteDto } from "./dto/add-customer-note.dto";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryCustomersDto) {
    return this.customersService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.customersService.remove(id);
  }

  @Post(":id/notes")
  addNote(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddCustomerNoteDto,
  ) {
    return this.customersService.addNote(id, dto);
  }

  @Get(":id/notes")
  listNotes(@Param("id", ParseUUIDPipe) id: string) {
    return this.customersService.listNotes(id);
  }

  @Get(":id/history")
  history(@Param("id", ParseUUIDPipe) id: string) {
    return this.customersService.history(id);
  }
}
