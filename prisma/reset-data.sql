-- ============================================================================
-- Mikado — Script de purge des données
-- Conserve : compte admin (admin@alvm.nc), app_settings, payment_methods, camp_types
-- ============================================================================

BEGIN;

-- 1. Écritures comptables (aucune FK entrante bloquante)
DELETE FROM accounting_entries;

-- 2. Allocations d'avoirs et crédits
DELETE FROM credit_note_allocations;
DELETE FROM credit_applications;
DELETE FROM parent_credits;

-- 3. Remboursements
DELETE FROM refunds;

-- 4. Paiements
DELETE FROM payments;

-- 5. Lignes de facture puis factures
DELETE FROM invoice_lines;
DELETE FROM invoices;

-- 6. Présences
DELETE FROM attendances;

-- 7. Inscriptions
DELETE FROM registrations;

-- 8. Documents enfants
DELETE FROM child_documents;

-- 9. Liens enfants-parents puis enfants
DELETE FROM children_parents;
DELETE FROM children;

-- 10. Jours de camp puis camps
DELETE FROM camp_days;
DELETE FROM camps;

-- 11. Parents (profils) — sauf admin
DELETE FROM parents;

-- 12. Staff members — sauf admin
DELETE FROM staff_members;

-- 13. Sessions et tokens (nettoyage auth)
DELETE FROM sessions;
DELETE FROM verification_tokens;

-- 14. Comptes et users non-admin
--     On garde l'admin (admin@alvm.nc) et son account credentials
DELETE FROM accounts
WHERE user_id NOT IN (
  SELECT id FROM users WHERE email = 'admin@alvm.nc'
);

DELETE FROM users
WHERE email != 'admin@alvm.nc';


COMMIT;
