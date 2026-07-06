-- ============================================================================
-- Migration 2026-07-06 — Alignement BDD prod (Neon) sur la refonte alvm-vercel
-- Générée par `prisma migrate diff --from-url <prod> --to-schema-datamodel`
-- puis relue. Rejouée et validée sur clone local du dump de prod du 2026-07-06.
--
-- Contenu métier :
--   - CREATE TABLE staff_documents (+ index, FK)
--   - invoices : + created_by_id, validated_by_id (FEAT-004), + version (verrou optimiste)
--   - attendances : camp_day_id → attendance_date (table vide en prod)
--   - children : defaults/nullabilité contacts d'urgence
--   - payments/refunds : suppression des DEFAULT DB (numéros générés côté app)
--   - parité indexes/FK avec schema.prisma (drop des idx_* legacy de l'ère triggers,
--     actions référentielles alignées RESTRICT/SET NULL/CASCADE)
--
-- Application : psql "$POSTGRES_URL_NON_POOLING" -1 -f <ce fichier>
-- (le -1 exécute le tout dans UNE transaction — rollback complet en cas d'erreur)
-- ============================================================================

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_cancellation_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_cancelled_by_fkey";

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_created_by_fkey";

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_credit_note_id_fkey";

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "accounting_entries" DROP CONSTRAINT "accounting_entries_refund_id_fkey";

-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_camp_day_id_fkey";

-- DropForeignKey
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_recorded_by_fkey";

-- DropForeignKey
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_registration_id_fkey";

-- DropForeignKey
ALTER TABLE "camp_days" DROP CONSTRAINT "camp_days_camp_id_fkey";

-- DropForeignKey
ALTER TABLE "camps" DROP CONSTRAINT "camps_camp_type_id_fkey";

-- DropForeignKey
ALTER TABLE "camps" DROP CONSTRAINT "camps_created_by_fkey";

-- DropForeignKey
ALTER TABLE "child_documents" DROP CONSTRAINT "child_documents_child_id_fkey";

-- DropForeignKey
ALTER TABLE "child_documents" DROP CONSTRAINT "child_documents_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "children_parents" DROP CONSTRAINT "children_parents_child_id_fkey";

-- DropForeignKey
ALTER TABLE "children_parents" DROP CONSTRAINT "children_parents_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_applications" DROP CONSTRAINT "credit_applications_applied_by_fkey";

-- DropForeignKey
ALTER TABLE "credit_applications" DROP CONSTRAINT "credit_applications_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_applications" DROP CONSTRAINT "credit_applications_parent_credit_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_applications" DROP CONSTRAINT "credit_applications_registration_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_note_allocations" DROP CONSTRAINT "credit_note_allocations_applied_to_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_note_allocations" DROP CONSTRAINT "credit_note_allocations_credit_note_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_note_allocations" DROP CONSTRAINT "credit_note_allocations_recorded_by_fkey";

-- DropForeignKey
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_registration_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_credited_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "parent_credits" DROP CONSTRAINT "parent_credits_credit_note_id_fkey";

-- DropForeignKey
ALTER TABLE "parent_credits" DROP CONSTRAINT "parent_credits_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "parents" DROP CONSTRAINT "parents_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_credit_note_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_payment_method_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_recorded_by_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_recorded_by_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_camp_id_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_cancelled_by_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_child_id_fkey";

-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_members" DROP CONSTRAINT "staff_members_user_id_fkey";

-- DropIndex
DROP INDEX "idx_accounting_entries_account_number";

-- DropIndex
DROP INDEX "idx_accounting_entries_credit_note_id";

-- DropIndex
DROP INDEX "idx_accounting_entries_date_account";

-- DropIndex
DROP INDEX "idx_accounting_entries_entry_date";

-- DropIndex
DROP INDEX "idx_accounting_entries_entry_date_journal";

-- DropIndex
DROP INDEX "idx_accounting_entries_entry_num";

-- DropIndex
DROP INDEX "idx_accounting_entries_invoice_id";

-- DropIndex
DROP INDEX "idx_accounting_entries_journal_code";

-- DropIndex
DROP INDEX "idx_accounting_entries_journal_date";

-- DropIndex
DROP INDEX "idx_accounting_entries_payment_id";

-- DropIndex
DROP INDEX "idx_accounting_entries_refund_id";

-- DropIndex
DROP INDEX "idx_accounts_user_id";

-- DropIndex
DROP INDEX "idx_app_settings_category";

-- DropIndex
DROP INDEX "idx_app_settings_key";

-- DropIndex
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_registration_id_camp_day_id_key";

-- DropIndex
DROP INDEX "idx_attendances_camp_day_id";

-- DropIndex
DROP INDEX "idx_attendances_date_status";

-- DropIndex
DROP INDEX "idx_attendances_recorded_by";

-- DropIndex
DROP INDEX "idx_attendances_registration_id";

-- DropIndex
DROP INDEX "idx_attendances_status";

-- DropIndex
DROP INDEX "idx_camp_days_camp_id";

-- DropIndex
DROP INDEX "idx_camp_days_date";

-- DropIndex
DROP INDEX "idx_camps_camp_type_id";

-- DropIndex
DROP INDEX "idx_camps_created_by";

-- DropIndex
DROP INDEX "idx_camps_end_date";

-- DropIndex
DROP INDEX "idx_camps_registration_deadline";

-- DropIndex
DROP INDEX "idx_camps_start_date";

-- DropIndex
DROP INDEX "idx_camps_status";

-- DropIndex
DROP INDEX "idx_child_documents_uploaded_by";

-- DropIndex
DROP INDEX "idx_children_birth_date";

-- DropIndex
DROP INDEX "idx_children_medical_info_gin";

-- DropIndex
DROP INDEX "idx_children_parents_child_id";

-- DropIndex
DROP INDEX "idx_children_parents_parent_id";

-- DropIndex
DROP INDEX "idx_credit_applications_parent_credit";

-- DropIndex
DROP INDEX "idx_allocations_credit_note";

-- DropIndex
DROP INDEX "idx_allocations_date";

-- DropIndex
DROP INDEX "idx_allocations_invoice";

-- DropIndex
DROP INDEX "idx_allocations_recorded_by";

-- DropIndex
DROP INDEX "idx_invoice_lines_invoice_id";

-- DropIndex
DROP INDEX "idx_invoice_lines_registration_id";

-- DropIndex
DROP INDEX "idx_invoices_due_date";

-- DropIndex
DROP INDEX "idx_invoices_invoice_number";

-- DropIndex
DROP INDEX "idx_invoices_parent_id";

-- DropIndex
DROP INDEX "idx_invoices_status";

-- DropIndex
DROP INDEX "idx_invoices_type";

-- DropIndex
DROP INDEX "idx_parents_email";

-- DropIndex
DROP INDEX "idx_parents_last_name";

-- DropIndex
DROP INDEX "idx_payments_date_method";

-- DropIndex
DROP INDEX "idx_payments_invoice_id";

-- DropIndex
DROP INDEX "idx_payments_payment_date";

-- DropIndex
DROP INDEX "idx_payments_payment_method_id";

-- DropIndex
DROP INDEX "idx_payments_payment_number";

-- DropIndex
DROP INDEX "idx_payments_recorded_by";

-- DropIndex
DROP INDEX "idx_refunds_payment_id";

-- DropIndex
DROP INDEX "idx_refunds_recorded_by";

-- DropIndex
DROP INDEX "idx_refunds_refund_date";

-- DropIndex
DROP INDEX "idx_refunds_refund_number";

-- DropIndex
DROP INDEX "idx_registrations_camp_id";

-- DropIndex
DROP INDEX "idx_registrations_child_id";

-- DropIndex
DROP INDEX "idx_registrations_parent_id";

-- DropIndex
DROP INDEX "idx_registrations_registration_date";

-- DropIndex
DROP INDEX "idx_registrations_selected_days_gin";

-- DropIndex
DROP INDEX "idx_registrations_status";

-- DropIndex
DROP INDEX "idx_sessions_session_token";

-- DropIndex
DROP INDEX "idx_sessions_user_id";

-- DropIndex
DROP INDEX "idx_users_email";

-- DropIndex
DROP INDEX "idx_users_role";

-- DropIndex
DROP INDEX "idx_verification_tokens_token";

-- AlterTable
ALTER TABLE "attendances" DROP COLUMN "camp_day_id",
ADD COLUMN     "attendance_date" DATE NOT NULL;

-- AlterTable
ALTER TABLE "children" ALTER COLUMN "medical_info" SET DEFAULT '{}',
ALTER COLUMN "emergency_contact_name" DROP NOT NULL,
ALTER COLUMN "emergency_contact_phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "validated_by_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "payment_number" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "refund_number" DROP DEFAULT;

-- DropEnum
DROP TYPE "credit_note_status";

-- DropEnum
DROP TYPE "payment_method";

-- DropEnum
DROP TYPE "staff_role";

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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

-- CreateIndex
CREATE UNIQUE INDEX "attendances_registration_id_attendance_date_key" ON "attendances"("registration_id", "attendance_date");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children_parents" ADD CONSTRAINT "children_parents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children_parents" ADD CONSTRAINT "children_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_documents" ADD CONSTRAINT "child_documents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_documents" ADD CONSTRAINT "child_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_camp_type_id_fkey" FOREIGN KEY ("camp_type_id") REFERENCES "camp_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_days" ADD CONSTRAINT "camp_days_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_camp_id_fkey" FOREIGN KEY ("camp_id") REFERENCES "camps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_fkey" FOREIGN KEY ("credited_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "parent_credits" ADD CONSTRAINT "parent_credits_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_credits" ADD CONSTRAINT "parent_credits_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_parent_credit_id_fkey" FOREIGN KEY ("parent_credit_id") REFERENCES "parent_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_applied_to_invoice_id_fkey" FOREIGN KEY ("applied_to_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_allocations" ADD CONSTRAINT "credit_note_allocations_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "unique_credit_note" RENAME TO "parent_credits_credit_note_id_key";

