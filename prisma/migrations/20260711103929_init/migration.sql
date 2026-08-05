-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateEnum
CREATE TYPE "sales"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "sales"."CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "sales"."QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "sales"."ProformaStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED', 'PAID');

-- CreateEnum
CREATE TYPE "sales"."InvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'VOIDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "sales"."PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "sales"."DeliveryStatus" AS ENUM ('PENDING', 'DISPATCHED', 'DELIVERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "sales"."PaymentMethod" AS ENUM ('CASH', 'BANK', 'CHEQUE', 'MOBILE_MONEY', 'CARD');

-- CreateEnum
CREATE TYPE "sales"."StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'RESERVE', 'RELEASE');

-- CreateEnum
CREATE TYPE "sales"."StockReferenceType" AS ENUM ('INVOICE', 'DELIVERY_NOTE', 'PAYMENT', 'MANUAL', 'CANCELLATION', 'RETURN');

-- CreateEnum
CREATE TYPE "sales"."AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'APPROVED', 'PRINTED', 'DOWNLOADED', 'LOGIN', 'LOGOUT', 'STATUS_CHANGED', 'SENT', 'EXPORTED');

-- CreateEnum
CREATE TYPE "sales"."DocumentType" AS ENUM ('QUOTATION', 'PROFORMA', 'TAX_INVOICE', 'DELIVERY_NOTE', 'PAYMENT_RECEIPT');

-- CreateTable
CREATE TABLE "sales"."users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(50),
    "status" "sales"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "sales"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sales"."customers" (
    "id" UUID NOT NULL,
    "customer_code" VARCHAR(40) NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "contact_person" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" TEXT,
    "tax_number" VARCHAR(100),
    "status" "sales"."CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "credit_limit" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."customer_notes" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."product_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "selling_price" DECIMAL(18,2) NOT NULL,
    "cost_price" DECIMAL(18,2) NOT NULL,
    "stock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "unit" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "category_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."quotations" (
    "id" UUID NOT NULL,
    "quotation_number" VARCHAR(40) NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "sales"."QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "accepted_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."quotation_items" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."proforma_invoices" (
    "id" UUID NOT NULL,
    "proforma_number" VARCHAR(40) NOT NULL,
    "quotation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "sales"."ProformaStatus" NOT NULL DEFAULT 'PENDING',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."proforma_items" (
    "id" UUID NOT NULL,
    "proforma_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proforma_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."tax_invoices" (
    "id" UUID NOT NULL,
    "invoice_number" VARCHAR(40) NOT NULL,
    "quotation_id" UUID,
    "proforma_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "sales"."InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "sales"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "total_paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tax_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."delivery_notes" (
    "id" UUID NOT NULL,
    "delivery_number" VARCHAR(40) NOT NULL,
    "invoice_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "sales"."DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "dispatch_date" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "vehicle" VARCHAR(100),
    "driver" VARCHAR(120),
    "receiver" VARCHAR(120),
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."delivery_note_items" (
    "id" UUID NOT NULL,
    "delivery_note_id" UUID NOT NULL,
    "invoice_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."payments" (
    "id" UUID NOT NULL,
    "payment_number" VARCHAR(40) NOT NULL,
    "customer_id" UUID NOT NULL,
    "invoice_id" UUID,
    "proforma_id" UUID,
    "method" "sales"."PaymentMethod" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" VARCHAR(120),
    "paid_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "receipt_path" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "sales"."StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2),
    "before_stock" DECIMAL(18,3) NOT NULL,
    "after_stock" DECIMAL(18,3) NOT NULL,
    "reference_type" "sales"."StockReferenceType" NOT NULL,
    "reference_id" UUID,
    "remarks" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."document_sequences" (
    "id" UUID NOT NULL,
    "document_type" "sales"."DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" VARCHAR(10) NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."file_assets" (
    "id" UUID NOT NULL,
    "document_type" "sales"."DocumentType" NOT NULL,
    "document_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."audit_logs" (
    "id" UUID NOT NULL,
    "action" "sales"."AuditAction" NOT NULL,
    "resource_type" VARCHAR(120) NOT NULL,
    "resource_id" UUID,
    "message" TEXT,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."activities" (
    "id" UUID NOT NULL,
    "activity_type" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "customer_id" UUID,
    "quotation_id" UUID,
    "proforma_id" UUID,
    "invoice_id" UUID,
    "delivery_note_id" UUID,
    "payment_id" UUID,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "sales"."users"("email");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "sales"."users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "sales"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "sales"."permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "sales"."customers"("customer_code");

-- CreateIndex
CREATE INDEX "idx_customers_company_name" ON "sales"."customers"("company_name");

-- CreateIndex
CREATE INDEX "idx_customers_status" ON "sales"."customers"("status");

-- CreateIndex
CREATE INDEX "idx_customer_notes_customer_id" ON "sales"."customer_notes"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "sales"."product_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "sales"."products"("sku");

-- CreateIndex
CREATE INDEX "idx_products_name" ON "sales"."products"("name");

-- CreateIndex
CREATE INDEX "idx_products_is_active" ON "sales"."products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotation_number_key" ON "sales"."quotations"("quotation_number");

-- CreateIndex
CREATE INDEX "idx_quotations_customer_id" ON "sales"."quotations"("customer_id");

-- CreateIndex
CREATE INDEX "idx_quotations_status" ON "sales"."quotations"("status");

-- CreateIndex
CREATE INDEX "idx_quotation_items_quotation_id" ON "sales"."quotation_items"("quotation_id");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_proforma_number_key" ON "sales"."proforma_invoices"("proforma_number");

-- CreateIndex
CREATE INDEX "idx_proformas_quotation_id" ON "sales"."proforma_invoices"("quotation_id");

-- CreateIndex
CREATE INDEX "idx_proformas_status" ON "sales"."proforma_invoices"("status");

-- CreateIndex
CREATE INDEX "idx_proforma_items_proforma_id" ON "sales"."proforma_items"("proforma_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_invoice_number_key" ON "sales"."tax_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "idx_invoices_proforma_id" ON "sales"."tax_invoices"("proforma_id");

-- CreateIndex
CREATE INDEX "idx_invoices_customer_id" ON "sales"."tax_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "idx_invoices_payment_status" ON "sales"."tax_invoices"("payment_status");

-- CreateIndex
CREATE INDEX "idx_invoices_status" ON "sales"."tax_invoices"("status");

-- CreateIndex
CREATE INDEX "idx_invoice_items_invoice_id" ON "sales"."invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_delivery_number_key" ON "sales"."delivery_notes"("delivery_number");

-- CreateIndex
CREATE INDEX "idx_delivery_notes_invoice_id" ON "sales"."delivery_notes"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_delivery_notes_status" ON "sales"."delivery_notes"("status");

-- CreateIndex
CREATE INDEX "idx_delivery_items_delivery_note_id" ON "sales"."delivery_note_items"("delivery_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_number_key" ON "sales"."payments"("payment_number");

-- CreateIndex
CREATE INDEX "idx_payments_customer_id" ON "sales"."payments"("customer_id");

-- CreateIndex
CREATE INDEX "idx_payments_invoice_id" ON "sales"."payments"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_payments_proforma_id" ON "sales"."payments"("proforma_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_product_id" ON "sales"."stock_movements"("product_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_reference" ON "sales"."stock_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_document_type_year_key" ON "sales"."document_sequences"("document_type", "year");

-- CreateIndex
CREATE INDEX "idx_file_assets_document" ON "sales"."file_assets"("document_type", "document_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_resource" ON "sales"."audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "sales"."audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_activities_created_at" ON "sales"."activities"("created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_user_read" ON "sales"."notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "sales"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sales"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "sales"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sales"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sales"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_notes" ADD CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."customer_notes" ADD CONSTRAINT "customer_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "sales"."product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotations" ADD CONSTRAINT "quotations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales"."quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."quotation_items" ADD CONSTRAINT "quotation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."proforma_invoices" ADD CONSTRAINT "proforma_invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales"."quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."proforma_invoices" ADD CONSTRAINT "proforma_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."proforma_invoices" ADD CONSTRAINT "proforma_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."proforma_items" ADD CONSTRAINT "proforma_items_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "sales"."proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."proforma_items" ADD CONSTRAINT "proforma_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."tax_invoices" ADD CONSTRAINT "tax_invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales"."quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."tax_invoices" ADD CONSTRAINT "tax_invoices_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "sales"."proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."tax_invoices" ADD CONSTRAINT "tax_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."tax_invoices" ADD CONSTRAINT "tax_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales"."tax_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."invoice_items" ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales"."tax_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "sales"."delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "sales"."invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."delivery_note_items" ADD CONSTRAINT "delivery_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sales"."customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales"."tax_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."payments" ADD CONSTRAINT "payments_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "sales"."proforma_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sales"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "sales"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."activities" ADD CONSTRAINT "activities_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "sales"."quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."activities" ADD CONSTRAINT "activities_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "sales"."proforma_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."activities" ADD CONSTRAINT "activities_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales"."tax_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."activities" ADD CONSTRAINT "activities_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "sales"."delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."activities" ADD CONSTRAINT "activities_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "sales"."payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."activities" ADD CONSTRAINT "activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "sales"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sales"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
