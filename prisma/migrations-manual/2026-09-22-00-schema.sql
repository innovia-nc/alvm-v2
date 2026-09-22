BEGIN;
-- DropIndex
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_camp_id_child_id_key;
DROP INDEX IF EXISTS "registrations_camp_id_child_id_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabled_at" TIMESTAMPTZ,
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "camps" ADD COLUMN     "total_price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "cancellation_requested_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "credited_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "credit_note_id" UUID;

-- CreateTable
CREATE TABLE "fec_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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
CREATE INDEX "children_parents_parent_id_idx" ON "children_parents"("parent_id");

-- CreateIndex
CREATE INDEX "camps_deleted_at_status_start_date_idx" ON "camps"("deleted_at", "status", "start_date");

-- CreateIndex
CREATE INDEX "registrations_camp_id_child_id_idx" ON "registrations"("camp_id", "child_id");

-- CreateIndex
CREATE INDEX "registrations_parent_id_deleted_at_registration_date_idx" ON "registrations"("parent_id", "deleted_at", "registration_date");

-- CreateIndex
CREATE INDEX "registrations_camp_id_status_deleted_at_idx" ON "registrations"("camp_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "registrations_child_id_idx" ON "registrations"("child_id");

-- CreateIndex
CREATE INDEX "invoices_parent_id_invoice_type_deleted_at_issue_date_idx" ON "invoices"("parent_id", "invoice_type", "deleted_at", "issue_date");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_deleted_at_idx" ON "invoices"("status", "due_date", "deleted_at");

-- CreateIndex
CREATE INDEX "invoices_credited_invoice_id_idx" ON "invoices"("credited_invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_registration_id_deleted_at_idx" ON "invoice_lines"("registration_id", "deleted_at");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_deleted_at_idx" ON "invoice_lines"("invoice_id", "deleted_at");

-- CreateIndex
CREATE INDEX "payments_invoice_id_payment_date_idx" ON "payments"("invoice_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_credit_note_id_idx" ON "payments"("credit_note_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_deleted_at_idx" ON "refunds"("payment_id", "deleted_at");

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
CREATE INDEX "parent_credits_parent_id_expires_at_created_at_idx" ON "parent_credits"("parent_id", "expires_at", "created_at");


COMMIT;
