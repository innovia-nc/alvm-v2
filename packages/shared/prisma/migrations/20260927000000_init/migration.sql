-- ============================================================================
-- Schéma initial ALVM multi-tenant (2026-09-27).
--
-- Base neuve : la refonte SaaS repart d'un historique de migrations Prisma
-- (fin des `prisma db push` + SQL manuel). Voir docs/adr/0002-multi-tenant-rls.md.
-- ============================================================================

-- Contexte de tenant de la transaction courante. Posé par l'application via
-- `set_config('app.org_id', …, true)` (portée transaction, jamais session) :
-- sans contexte, la fonction renvoie NULL et aucune ligne métier n'est visible.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid
$$;

-- Portée de la transaction : 'tenant' (espace d'une association), 'platform'
-- (super administration), 'auth' (connexion / récupération de compte), 'none'.
CREATE OR REPLACE FUNCTION app_current_scope() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.scope', true), ''), 'none')
$$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "organization_kind" AS ENUM ('PLATFORM', 'TENANT');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('PARENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "gender_type" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "camp_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLIST');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "invoice_type" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('UNPAID', 'PAID', 'PARTIAL', 'REFUNDED');

-- CreateEnum
CREATE TYPE "refund_method" AS ENUM ('IMMEDIATE_REFUND', 'FUTURE_CREDIT');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "organization_kind" NOT NULL DEFAULT 'TENANT',
    "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
    "suspended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "platform_integrations" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "encrypted_secret" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID DEFAULT app_current_org_id(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "kind" VARCHAR(32) NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("organization_id","kind")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "kind" VARCHAR(40) NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "related_id" UUID,
    "status" "email_status" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMPTZ,
    "image" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'PARENT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ,
    "session_version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" BIGINT,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "parents" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "homePhone" TEXT,
    "workPhone" TEXT,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "employeur" VARCHAR(100),
    "fonction" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "staff_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "description" TEXT,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "gender" "gender_type" NOT NULL,
    "ecole" VARCHAR(100),
    "medical_info" JSONB DEFAULT '{}',
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "emergency_contact_relation" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children_parents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "child_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "relationship" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "children_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "child_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "description" TEXT,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "child_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "description" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "accounting_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camp_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "camp_type_id" UUID NOT NULL,
    "location" TEXT NOT NULL,
    "max_capacity" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "registration_deadline" TIMESTAMPTZ NOT NULL,
    "total_price" DECIMAL(10,2),
    "price_per_day" DECIMAL(10,2) NOT NULL,
    "status" "camp_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "camp_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "theme" TEXT,
    "location" TEXT,
    "max_capacity_override" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camp_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "camp_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "status" "registration_status" NOT NULL DEFAULT 'PENDING',
    "payment_status" "payment_status" NOT NULL DEFAULT 'UNPAID',
    "registration_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "special_requirements" TEXT,
    "selected_days" UUID[],
    "cancellation_requested_at" TIMESTAMPTZ,
    "cancellation_date" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "cancelled_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "registration_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "status" "attendance_status" NOT NULL DEFAULT 'PRESENT',
    "arrival_time" TIME,
    "departure_time" TIME,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "invoice_number" TEXT NOT NULL,
    "parent_id" UUID NOT NULL,
    "invoice_type" "invoice_type" NOT NULL DEFAULT 'INVOICE',
    "credited_invoice_id" UUID,
    "is_future_credit" BOOLEAN DEFAULT false,
    "refund_method" "refund_method",
    "issue_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "due_date" DATE NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "subtotal_ht" DECIMAL(10,2),
    "tax_amount" DECIMAL(10,2),
    "tax_rate" DECIMAL(5,4),
    "credited_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "pdf_url" TEXT,
    "accounting_exported_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_by_id" UUID,
    "validated_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "invoice_id" UUID NOT NULL,
    "registration_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "total_ht" DECIMAL(10,2),
    "total_ttc" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "accounting_code" VARCHAR(10),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "payment_number" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "payment_method_id" UUID NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "credit_note_id" UUID,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "credit_note_id" UUID,
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "refund_number" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "refund_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "refund_method" "refund_method" NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "invoice_id" UUID,
    "payment_id" UUID,
    "credit_note_id" UUID,
    "refund_id" UUID,
    "journal_code" VARCHAR(3) NOT NULL,
    "journal_lib" TEXT NOT NULL,
    "entry_num" TEXT,
    "entry_date" DATE NOT NULL,
    "account_number" VARCHAR(10) NOT NULL,
    "account_label" TEXT NOT NULL,
    "compte_aux_num" VARCHAR(20),
    "compte_aux_lib" TEXT,
    "piece_ref" TEXT NOT NULL,
    "piece_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ecriture_let" VARCHAR(10),
    "date_let" DATE,
    "valid_date" DATE,
    "montant_devise" DECIMAL(15,2),
    "id_devise" VARCHAR(3),
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancellation_entry_id" UUID,
    "cancellation_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "parent_id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "amount_original" DECIMAL(10,2) NOT NULL,
    "amount_remaining" DECIMAL(10,2) NOT NULL,
    "currency" TEXT DEFAULT 'XPF',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "notes" TEXT,

    CONSTRAINT "parent_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "parent_credit_id" UUID NOT NULL,
    "registration_id" UUID,
    "invoice_id" UUID,
    "amount_used" DECIMAL(10,2) NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_by" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "credit_note_id" UUID NOT NULL,
    "applied_to_invoice_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "allocation_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fec_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL DEFAULT app_current_org_id(),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entry_count" INTEGER NOT NULL,

    CONSTRAINT "fec_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "platform_audit_logs_created_at_id_idx" ON "platform_audit_logs"("created_at", "id");

-- CreateIndex
CREATE INDEX "platform_audit_logs_actor_id_created_at_idx" ON "platform_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_organization_id_created_at_idx" ON "platform_audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_organization_id_created_at_idx" ON "email_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_related_id_idx" ON "email_messages"("related_id");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "parents_organization_id_idx" ON "parents"("organization_id");

-- CreateIndex
CREATE INDEX "staff_members_organization_id_idx" ON "staff_members"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_organization_id_email_key" ON "staff_members"("organization_id", "email");

-- CreateIndex
CREATE INDEX "staff_documents_organization_id_idx" ON "staff_documents"("organization_id");

-- CreateIndex
CREATE INDEX "children_organization_id_idx" ON "children"("organization_id");

-- CreateIndex
CREATE INDEX "children_parents_parent_id_idx" ON "children_parents"("parent_id");

-- CreateIndex
CREATE INDEX "children_parents_organization_id_idx" ON "children_parents"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "children_parents_child_id_parent_id_key" ON "children_parents"("child_id", "parent_id");

-- CreateIndex
CREATE INDEX "child_documents_organization_id_idx" ON "child_documents"("organization_id");

-- CreateIndex
CREATE INDEX "app_settings_organization_id_idx" ON "app_settings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_org_category_key_unique" ON "app_settings"("organization_id", "category", "key");

-- CreateIndex
CREATE INDEX "camp_types_organization_id_idx" ON "camp_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "camp_types_organization_id_name_key" ON "camp_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "camps_deleted_at_status_start_date_idx" ON "camps"("deleted_at", "status", "start_date");

-- CreateIndex
CREATE INDEX "camps_organization_id_idx" ON "camps"("organization_id");

-- CreateIndex
CREATE INDEX "camp_days_organization_id_idx" ON "camp_days"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "camp_days_camp_id_date_key" ON "camp_days"("camp_id", "date");

-- CreateIndex
CREATE INDEX "registrations_camp_id_child_id_idx" ON "registrations"("camp_id", "child_id");

-- CreateIndex
CREATE INDEX "registrations_parent_id_deleted_at_registration_date_idx" ON "registrations"("parent_id", "deleted_at", "registration_date");

-- CreateIndex
CREATE INDEX "registrations_camp_id_status_deleted_at_idx" ON "registrations"("camp_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "registrations_child_id_idx" ON "registrations"("child_id");

-- CreateIndex
CREATE INDEX "registrations_organization_id_idx" ON "registrations"("organization_id");

-- CreateIndex
CREATE INDEX "attendances_organization_id_idx" ON "attendances"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_registration_id_attendance_date_key" ON "attendances"("registration_id", "attendance_date");

-- CreateIndex
CREATE INDEX "invoices_parent_id_invoice_type_deleted_at_issue_date_idx" ON "invoices"("parent_id", "invoice_type", "deleted_at", "issue_date");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_deleted_at_idx" ON "invoices"("status", "due_date", "deleted_at");

-- CreateIndex
CREATE INDEX "invoices_credited_invoice_id_idx" ON "invoices"("credited_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_idx" ON "invoices"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_invoice_number_key" ON "invoices"("organization_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_lines_registration_id_deleted_at_idx" ON "invoice_lines"("registration_id", "deleted_at");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_deleted_at_idx" ON "invoice_lines"("invoice_id", "deleted_at");

-- CreateIndex
CREATE INDEX "invoice_lines_organization_id_idx" ON "invoice_lines"("organization_id");

-- CreateIndex
CREATE INDEX "payment_methods_organization_id_idx" ON "payment_methods"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_organization_id_code_key" ON "payment_methods"("organization_id", "code");

-- CreateIndex
CREATE INDEX "payments_invoice_id_payment_date_idx" ON "payments"("invoice_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_credit_note_id_idx" ON "payments"("credit_note_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_idx" ON "payments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_payment_number_key" ON "payments"("organization_id", "payment_number");

-- CreateIndex
CREATE INDEX "refunds_payment_id_deleted_at_idx" ON "refunds"("payment_id", "deleted_at");

-- CreateIndex
CREATE INDEX "refunds_organization_id_idx" ON "refunds"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_refund_number_key" ON "refunds"("organization_id", "refund_number");

-- CreateIndex
CREATE INDEX "accounting_entries_is_cancelled_entry_date_journal_code_idx" ON "accounting_entries"("is_cancelled", "entry_date", "journal_code");

-- CreateIndex
CREATE INDEX "accounting_entries_invoice_id_idx" ON "accounting_entries"("invoice_id");

-- CreateIndex
CREATE INDEX "accounting_entries_payment_id_idx" ON "accounting_entries"("payment_id");

-- CreateIndex
CREATE INDEX "accounting_entries_credit_note_id_idx" ON "accounting_entries"("credit_note_id");

-- CreateIndex
CREATE INDEX "accounting_entries_refund_id_idx" ON "accounting_entries"("refund_id");

-- CreateIndex
CREATE INDEX "accounting_entries_organization_id_idx" ON "accounting_entries"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_credits_credit_note_id_key" ON "parent_credits"("credit_note_id");

-- CreateIndex
CREATE INDEX "parent_credits_parent_id_expires_at_created_at_idx" ON "parent_credits"("parent_id", "expires_at", "created_at");

-- CreateIndex
CREATE INDEX "parent_credits_organization_id_idx" ON "parent_credits"("organization_id");

-- CreateIndex
CREATE INDEX "credit_applications_organization_id_idx" ON "credit_applications"("organization_id");

-- CreateIndex
CREATE INDEX "credit_note_allocations_organization_id_idx" ON "credit_note_allocations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_allocation" ON "credit_note_allocations"("credit_note_id", "applied_to_invoice_id");

-- CreateIndex
CREATE INDEX "fec_exports_organization_id_idx" ON "fec_exports"("organization_id");

-- CreateIndex
CREATE INDEX "login_attempts_window_start_idx" ON "login_attempts"("window_start");

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children_parents" ADD CONSTRAINT "children_parents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children_parents" ADD CONSTRAINT "children_parents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children_parents" ADD CONSTRAINT "children_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_documents" ADD CONSTRAINT "child_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_documents" ADD CONSTRAINT "child_documents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_documents" ADD CONSTRAINT "child_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_types" ADD CONSTRAINT "camp_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_camp_type_id_fkey" FOREIGN KEY ("camp_type_id") REFERENCES "camp_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_days" ADD CONSTRAINT "camp_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_days" ADD CONSTRAINT "camp_days_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "camps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_fkey" FOREIGN KEY ("credited_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_cancellation_entry_id_fkey" FOREIGN KEY ("cancellation_entry_id") REFERENCES "accounting_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_credits" ADD CONSTRAINT "parent_credits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_credits" ADD CONSTRAINT "parent_credits_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_credits" ADD CONSTRAINT "parent_credits_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_parent_credit_id_fkey" FOREIGN KEY ("parent_credit_id") REFERENCES "parent_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_applied_to_invoice_id_fkey" FOREIGN KEY ("applied_to_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fec_exports" ADD CONSTRAINT "fec_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

