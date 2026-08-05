-- DropForeignKey
ALTER TABLE "sales"."tax_invoices" DROP CONSTRAINT "tax_invoices_proforma_id_fkey";

-- AddForeignKey
ALTER TABLE "sales"."tax_invoices" ADD CONSTRAINT "tax_invoices_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "sales"."proforma_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
