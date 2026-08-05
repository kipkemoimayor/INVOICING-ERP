import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller";
import { ConfigModule } from "@nestjs/config";
import { DataAccessModule } from "./data-access/data-access.module";
import { DataAccessService } from "./data-access/data-access.service";
import { AuthModule } from "./modules/auth/auth.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { UsersModule } from "./modules/users/users.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { ProductsModule } from "./modules/products/products.module";
import { QuotationsModule } from "./modules/quotations/quotations.module";
import { ProformasModule } from "./modules/proformas/proformas.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { DeliveryNotesModule } from "./modules/delivery-notes/delivery-notes.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { WorkflowModule } from "./modules/workflow/workflow.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SearchModule } from "./modules/search/search.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { EmailModule } from "./modules/email/email.module";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "./modules/rbac/guards/permissions.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DataAccessModule,
    AuthModule,
    RbacModule,
    UsersModule,
    DashboardModule,
    CustomersModule,
    ProductsModule,
    QuotationsModule,
    ProformasModule,
    InvoicesModule,
    DeliveryNotesModule,
    PaymentsModule,
    InventoryModule,
    ReportsModule,
    AuditLogsModule,
    WorkflowModule,
    DocumentsModule,
    NotificationsModule,
    SearchModule,
    SettingsModule,
    ProfileModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    DataAccessService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
