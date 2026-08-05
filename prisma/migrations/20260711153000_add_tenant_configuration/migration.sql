-- CreateTable
CREATE TABLE "sales"."tenant_configurations" (
    "id" UUID NOT NULL,
    "tenant_key" VARCHAR(100) NOT NULL DEFAULT 'default',
    "company_name" VARCHAR(255) NOT NULL,
    "trade_name" VARCHAR(255),
    "tagline" VARCHAR(255),
    "postal_address" VARCHAR(255),
    "physical_address" VARCHAR(255),
    "city" VARCHAR(120),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "logo_path" VARCHAR(500),
    "prepared_by_label" VARCHAR(100),
    "lpo_label" VARCHAR(100),
    "comments_label" VARCHAR(150),
    "default_currency" VARCHAR(10) NOT NULL DEFAULT 'KSH',
    "default_terms" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configurations_tenant_key_key" ON "sales"."tenant_configurations"("tenant_key");
