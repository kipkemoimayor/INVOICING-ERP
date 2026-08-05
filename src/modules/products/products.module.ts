import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { DataAccessModule } from "../../data-access/data-access.module";

@Module({
  imports: [DataAccessModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
