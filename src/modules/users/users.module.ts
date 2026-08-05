import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { DataAccessModule } from "../../data-access/data-access.module";

@Module({
  imports: [DataAccessModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
