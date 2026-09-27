-- ============================================================================
-- Invariants métier que Prisma ne modélise pas (index partiels, CHECK,
-- triggers). Repris de prisma/migrations-manual/2026-09-22-business-invariants.sql
-- et 2026-07-06-postal-code-check.sql, adaptés au multi-tenant.
--
-- Prisma ignore les index partiels, CHECK et triggers lors du calcul de dérive
-- (vérifié : `prisma migrate diff --from-migrations … --to-schema-datamodel`
-- ne propose pas de les supprimer). Ils ne vivent donc qu'ici.
-- ============================================================================

-- Identifiant public d'un tenant : minuscules, chiffres, tirets (3 à 40).
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_format
  CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

-- Un seul espace de plateforme (super administration).
CREATE UNIQUE INDEX organizations_single_platform ON organizations (kind) WHERE kind = 'PLATFORM';

-- Un compte SUPER_ADMIN vit dans l'espace de plateforme, et seulement lui.
CREATE OR REPLACE FUNCTION alvm_check_user_organization() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE org_kind organization_kind;
BEGIN
  SELECT kind INTO org_kind FROM organizations WHERE id = NEW.organization_id;
  IF org_kind IS NULL THEN
    RAISE EXCEPTION 'Organisation inconnue pour le compte %', NEW.id USING ERRCODE = '23503';
  END IF;
  IF (NEW.role = 'SUPER_ADMIN') <> (org_kind = 'PLATFORM') THEN
    RAISE EXCEPTION 'Le rôle % est incompatible avec cet espace', NEW.role USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER alvm_users_organization_kind
  BEFORE INSERT OR UPDATE OF role, organization_id ON users
  FOR EACH ROW EXECUTE FUNCTION alvm_check_user_organization();

-- Une seule inscription active par enfant et par camp (les annulées et
-- supprimées ne comptent pas).
CREATE UNIQUE INDEX registrations_active_camp_child ON registrations (camp_id, child_id)
  WHERE deleted_at IS NULL AND status <> 'CANCELLED';

-- Statut de paiement des inscriptions, dérivé de leur facture.
CREATE OR REPLACE FUNCTION alvm_sync_registration_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE registrations r SET payment_status = CASE
    WHEN r.status = 'CANCELLED' THEN 'REFUNDED'::payment_status
    WHEN NEW.status IN ('CANCELLED', 'DRAFT') THEN 'UNPAID'::payment_status
    WHEN NEW.status = 'CREDITED' THEN 'REFUNDED'::payment_status
    WHEN NEW.paid_amount >= NEW.total_amount - NEW.credited_amount THEN 'PAID'::payment_status
    WHEN NEW.paid_amount > 0 THEN 'PARTIAL'::payment_status
    ELSE 'UNPAID'::payment_status END
  WHERE r.deleted_at IS NULL
    AND r.id IN (SELECT registration_id FROM invoice_lines WHERE invoice_id = NEW.id AND deleted_at IS NULL)
    AND NEW.invoice_type = 'INVOICE';
  RETURN NEW;
END $$;
CREATE TRIGGER alvm_invoice_payment_status
  AFTER UPDATE OF paid_amount, credited_amount, status ON invoices
  FOR EACH ROW EXECUTE FUNCTION alvm_sync_registration_payment();

-- Date de naissance plausible.
ALTER TABLE children ADD CONSTRAINT children_birth_date_valid
  CHECK (birth_date <= CURRENT_DATE AND birth_date >= CURRENT_DATE - interval '120 years') NOT VALID;

-- Code postal : non renseigné ('') ou 5 caractères (contrat Zod + UI).
ALTER TABLE parents ADD CONSTRAINT parents_postal_code_check
  CHECK (postal_code = '' OR length(postal_code) = 5);

-- Montants de compteurs positifs.
ALTER TABLE document_counters ADD CONSTRAINT document_counters_value_positive CHECK (value >= 0);

