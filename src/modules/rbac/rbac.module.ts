import { Module } from "@nestjs/common";
import { DataAccessModule } from "../../data-access/data-access.module";
import { RbacController } from "./rbac.controller";
import { RbacService } from "./rbac.service";

@Module({
  imports: [DataAccessModule],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
