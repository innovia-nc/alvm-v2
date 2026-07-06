-- ============================================================================
-- Data-fix 2026-07-06 — parents_postal_code_check incompatible avec le contrat
--
-- La contrainte legacy exigeait exactement 5 caractères (colonne NOT NULL),
-- mais le contrat applicatif (Zod + UI) rend le code postal optionnel et
-- l'app persiste '' quand il est vide (convention identique à address/city)
-- → toute création de parent sans code postal était un 500 en prod.
--
-- Nouvelle règle : '' (non renseigné) OU 5 caractères. La validation Zod
-- garantit désormais 5 chiffres quand le champ est fourni.
-- Idempotent (DROP IF EXISTS + ADD).
-- ============================================================================

ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_postal_code_check;
ALTER TABLE parents ADD CONSTRAINT parents_postal_code_check
  CHECK (postal_code = '' OR length(postal_code) = 5);
