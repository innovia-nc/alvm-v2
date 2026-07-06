-- ============================================================================
-- Assainissement 2026-07-06 (TD-002) — annulation des factures brouillon legacy
-- à 0 XPF importées de l'ancienne app (lignes à unit_price 0, avant câblage des
-- tarifs). Elles ne sont pas payables (aucun restant dû) et polluent la liste.
--
-- Action : passer ces factures en CANCELLED — reproduit EXACTEMENT ce que fait
-- l'app (invoices.updateStatus → CANCELLED : status + version++), transition
-- valide depuis DRAFT et SENT. Les INSCRIPTIONS liées restent CONFIRMED/UNPAID
-- (non touchées) → elles réapparaissent dans « inscriptions non payées » et
-- pourront être REFACTURÉES au bon tarif via l'app.
--
-- Garde-fous (idempotent + sûr) : on ne touche QUE les factures
--   - total_amount = 0 ET paid_amount = 0  (aucun paiement),
--   - status IN ('DRAFT','SENT')           (transitions autorisées vers CANCELLED),
--   - non supprimées,
--   - SANS aucune écriture comptable        (une facture à 0 n'en a jamais ;
--                                            défense en profondeur).
-- Re-jouer ce script ne re-cancelle rien (les CANCELLED sortent du WHERE).
--
-- Rejoué et validé sur clone du dump de prod du 2026-07-06 (14 lignes de
-- factures, 10 factures → 10 CANCELLED, inscriptions restées refacturables).
-- ============================================================================

BEGIN;

UPDATE invoices i
SET status = 'CANCELLED',
    version = i.version + 1,
    updated_at = now()
WHERE i.deleted_at IS NULL
  AND i.total_amount = 0
  AND i.paid_amount = 0
  AND i.status IN ('DRAFT', 'SENT')
  AND NOT EXISTS (
    SELECT 1 FROM accounting_entries ae WHERE ae.invoice_id = i.id
  );

-- Contrôle : afficher le nombre de factures 0 XPF restant en DRAFT/SENT (doit être 0)
DO $$
DECLARE reste int;
BEGIN
  SELECT count(*) INTO reste FROM invoices
   WHERE deleted_at IS NULL AND total_amount = 0
     AND status IN ('DRAFT','SENT');
  RAISE NOTICE 'Factures 0 XPF restant en DRAFT/SENT apres assainissement : %', reste;
END $$;

COMMIT;
