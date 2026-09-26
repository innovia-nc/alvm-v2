-- Disposable alvm_migrations database only. Entire data and index changes roll back.
BEGIN;
DO $$ BEGIN IF current_database() <> 'alvm_migrations' THEN RAISE EXCEPTION 'Disposable benchmark database required'; END IF; END $$;
INSERT INTO users (id,email,role) SELECT md5('bench-'||n)::uuid, 'bench-'||n||'@test.local','PARENT' FROM generate_series(1,1000) n;
INSERT INTO parents(user_id,first_name,last_name,phone,email,address,city,postal_code) SELECT id,'Test','Volume','000',email,'','','' FROM users WHERE email LIKE 'bench-%';
INSERT INTO invoices(invoice_number,parent_id,due_date,total_amount,status,issue_date)
SELECT 'BENCH-'||n,md5('bench-'||(1+n%1000))::uuid,CURRENT_DATE+30,10000,'SENT',CURRENT_DATE-(n%730) FROM generate_series(1,100000) n;
ANALYZE invoices;
-- Baseline without the new query indexes, then exactly the same query with them.
DROP INDEX invoices_parent_id_invoice_type_deleted_at_issue_date_idx;
DROP INDEX invoices_status_due_date_deleted_at_idx;
EXPLAIN (ANALYZE,BUFFERS) SELECT id,invoice_number,total_amount FROM invoices WHERE parent_id=md5('bench-100')::uuid AND invoice_type='INVOICE' AND deleted_at IS NULL ORDER BY issue_date DESC,id ASC LIMIT 20;
CREATE INDEX invoices_parent_id_invoice_type_deleted_at_issue_date_idx ON invoices(parent_id,invoice_type,deleted_at,issue_date);
CREATE INDEX invoices_status_due_date_deleted_at_idx ON invoices(status,due_date,deleted_at);
ANALYZE invoices;
EXPLAIN (ANALYZE,BUFFERS) SELECT id,invoice_number,total_amount FROM invoices WHERE parent_id=md5('bench-100')::uuid AND invoice_type='INVOICE' AND deleted_at IS NULL ORDER BY issue_date DESC,id ASC LIMIT 20;
ROLLBACK;
