ALTER TABLE "sales"."tenant_configurations"
ADD COLUMN "skip_proforma" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sales"."tax_invoices"
ALTER COLUMN "proforma_id" DROP NOT NULL;
