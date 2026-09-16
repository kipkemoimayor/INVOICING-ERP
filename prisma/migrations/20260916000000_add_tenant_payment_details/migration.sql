-- CreateEnum
CREATE TYPE "sales"."MpesaAccountType" AS ENUM ('TILL', 'PAYBILL');

-- AlterTable
ALTER TABLE "sales"."tenant_configurations"
    ADD COLUMN "kra_pin" VARCHAR(100),
    ADD COLUMN "bank_name" VARCHAR(255),
    ADD COLUMN "bank_account_number" VARCHAR(80),
    ADD COLUMN "mpesa_account_type" "sales"."MpesaAccountType",
    ADD COLUMN "mpesa_till_number" VARCHAR(50),
    ADD COLUMN "mpesa_paybill_number" VARCHAR(50),
    ADD COLUMN "mpesa_account_number" VARCHAR(80);
