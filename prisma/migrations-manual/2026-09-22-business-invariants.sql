BEGIN;
ALTER TABLE camps ADD COLUMN IF NOT EXISTS total_price numeric(10,2);
UPDATE camps SET total_price = price_per_day * (end_date - start_date + 1) WHERE total_price IS NULL;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credited_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS credit_note_id uuid REFERENCES invoices(id);
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_camp_id_child_id_key;
DROP INDEX IF EXISTS registrations_camp_id_child_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_camp_child ON registrations(camp_id, child_id) WHERE deleted_at IS NULL AND status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS registrations_camp_id_child_id_idx ON registrations(camp_id, child_id);
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS credit_note_number_seq;
CREATE SEQUENCE IF NOT EXISTS payment_number_seq;
CREATE SEQUENCE IF NOT EXISTS refund_number_seq;
CREATE SEQUENCE IF NOT EXISTS accounting_entry_seq;
-- Never restart document numbering when installing on existing records.
SELECT setval('invoice_number_seq', GREATEST((SELECT last_value FROM invoice_number_seq), COALESCE((SELECT max(substring(invoice_number from '-([0-9]+)$')::bigint) FROM invoices WHERE invoice_number ~ '^FAC-[0-9]{4}-[0-9]+$'),0)), true);
SELECT setval('credit_note_number_seq', GREATEST((SELECT last_value FROM credit_note_number_seq), COALESCE((SELECT max(substring(invoice_number from '-([0-9]+)$')::bigint) FROM invoices WHERE invoice_number ~ '^AVO-[0-9]{4}-[0-9]+$'),0)), true);
SELECT setval('payment_number_seq', GREATEST((SELECT last_value FROM payment_number_seq), COALESCE((SELECT max(substring(payment_number from '-([0-9]+)$')::bigint) FROM payments WHERE payment_number ~ '^PAI-[0-9]{4}-[0-9]+$'),0)), true);
SELECT setval('refund_number_seq', GREATEST((SELECT last_value FROM refund_number_seq), COALESCE((SELECT max(substring(refund_number from '-([0-9]+)$')::bigint) FROM refunds WHERE refund_number ~ '^REM-[0-9]{4}-[0-9]+$'),0)), true);
SELECT setval('accounting_entry_seq', GREATEST((SELECT last_value FROM accounting_entry_seq), COALESCE((SELECT max(substring(entry_num from '^[A-Z]{2}[0-9]{8}([0-9]+)$')::bigint) FROM accounting_entries WHERE entry_num ~ '^[A-Z]{2}[0-9]{12,}$'),0)), true);

-- Application and clean installations use the same versioned payment-status rule.
CREATE OR REPLACE FUNCTION alvm_sync_registration_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  target := NEW.id;
  UPDATE registrations r SET payment_status = CASE
    WHEN r.status = 'CANCELLED' THEN 'REFUNDED'::payment_status
    WHEN NEW.status IN ('CANCELLED','DRAFT') THEN 'UNPAID'::payment_status
    WHEN NEW.status = 'CREDITED' THEN 'REFUNDED'::payment_status
    WHEN NEW.paid_amount >= NEW.total_amount - NEW.credited_amount THEN 'PAID'::payment_status
    WHEN NEW.paid_amount > 0 THEN 'PARTIAL'::payment_status
    ELSE 'UNPAID'::payment_status END
  WHERE r.deleted_at IS NULL AND r.id IN (SELECT registration_id FROM invoice_lines WHERE invoice_id = target AND deleted_at IS NULL)
    AND NEW.invoice_type = 'INVOICE';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS alvm_invoice_payment_status ON invoices;
CREATE TRIGGER alvm_invoice_payment_status AFTER UPDATE OF paid_amount, credited_amount, status ON invoices FOR EACH ROW EXECUTE FUNCTION alvm_sync_registration_payment();

-- Backfill camp days without replacing existing IDs referenced by registrations.
INSERT INTO camp_days (id, camp_id, date, created_at, updated_at)
SELECT gen_random_uuid(), c.id, d::date, now(), now() FROM camps c CROSS JOIN LATERAL generate_series(c.start_date::timestamp, c.end_date::timestamp, interval '1 day') d
WHERE c.deleted_at IS NULL ON CONFLICT (camp_id,date) DO NOTHING;
UPDATE registrations r SET selected_days = ARRAY(SELECT d.id FROM camp_days d WHERE d.camp_id=r.camp_id ORDER BY d.date) WHERE deleted_at IS NULL;
-- Existing legacy checks that capped participant age are replaced, preserving other checks.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='children'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%birth_date%' LOOP
    EXECUTE format('ALTER TABLE children DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE children ADD CONSTRAINT children_birth_date_valid CHECK (birth_date <= CURRENT_DATE AND birth_date >= CURRENT_DATE - interval '120 years') NOT VALID;
-- Add the FK even when Prisma already created the column.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='refunds'::regclass AND conname='refunds_credit_note_id_fkey') THEN
    ALTER TABLE refunds ADD CONSTRAINT refunds_credit_note_id_fkey FOREIGN KEY(credit_note_id) REFERENCES invoices(id);
  END IF;
END $$;
-- Replay synchronization for existing invoices; no monetary value is changed.
UPDATE invoices SET paid_amount=paid_amount WHERE invoice_type='INVOICE' AND deleted_at IS NULL AND status NOT IN ('CANCELLED','DRAFT');
CREATE INDEX IF NOT EXISTS login_attempts_window_start_idx ON login_attempts(window_start);
COMMIT;
