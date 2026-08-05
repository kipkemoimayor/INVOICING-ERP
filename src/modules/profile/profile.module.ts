import { Module } from "@nestjs/common";
import { DataAccessModule } from "../../data-access/data-access.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [DataAccessModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
