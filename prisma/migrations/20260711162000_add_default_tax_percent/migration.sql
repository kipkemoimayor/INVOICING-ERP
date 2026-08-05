ALTER TABLE "sales"."tenant_configurations"
ADD COLUMN "default_tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 16.00;
