-- ============================================================================
-- Row Level Security — isolation des tenants (CLAUDE.md InnovIA §5.8).
--
-- Le rôle applicatif (DATABASE_URL) est NOSUPERUSER NOBYPASSRLS ; FORCE RLS
-- soumet aussi le propriétaire des tables aux policies. Le contexte est posé
-- par transaction (server/db/tenant.ts) :
--   app.scope  = tenant | platform | auth   (app_current_scope())
--   app.org_id = uuid du tenant             (app_current_org_id())
--
-- Tables métier : visibles et modifiables uniquement pour app.org_id.
-- Sans contexte, aucune ligne n'est visible (fail-closed).
-- Les tests d'isolation vivent dans test/integration/rls-isolation.integration.spec.ts.
-- ============================================================================

ALTER TABLE "parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "parents"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "staff_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_members"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "staff_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_documents"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "children" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "children" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "children"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "children_parents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "children_parents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "children_parents"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "child_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "child_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "child_documents"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "app_settings"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "camp_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "camp_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "camp_types"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "camps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "camps" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "camps"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "camp_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "camp_days" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "camp_days"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "registrations"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attendances"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoices"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invoice_lines"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_methods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_methods"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refunds"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "accounting_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "accounting_entries"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "parent_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parent_credits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "parent_credits"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "credit_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_applications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_applications"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "credit_note_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_note_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_note_allocations"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "fec_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fec_exports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fec_exports"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "document_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_counters"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE "email_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_messages"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- Comptes : le tenant voit les siens ; la connexion (auth) et la super
-- administration (platform) doivent retrouver un compte avant de connaître son tenant.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (organization_id = app_current_org_id() OR app_current_scope() IN ('platform', 'auth'))
  WITH CHECK (organization_id = app_current_org_id() OR app_current_scope() IN ('platform', 'auth'));

-- Identifiants et sessions NextAuth : visibles si et seulement si le compte l'est
-- (la sous-requête sur users est elle-même soumise à la RLS).
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY follows_user ON "accounts"
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = accounts.user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = accounts.user_id));

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY follows_user ON "sessions"
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = sessions.user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = sessions.user_id));

-- Jetons de réinitialisation (`password:<userId>`) : même visibilité que le compte.
ALTER TABLE "verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY follows_user ON "verification_tokens"
  USING (EXISTS (SELECT 1 FROM users u WHERE 'password:' || u.id::text = verification_tokens.identifier))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE 'password:' || u.id::text = verification_tokens.identifier));

-- Organisations : un tenant ne voit que la sienne ; seule la plateforme les modifie.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_read ON "organizations" FOR SELECT
  USING (id = app_current_org_id() OR app_current_scope() IN ('platform', 'auth'));
CREATE POLICY organization_platform_insert ON "organizations" FOR INSERT
  WITH CHECK (app_current_scope() = 'platform');
CREATE POLICY organization_platform_update ON "organizations" FOR UPDATE
  USING (app_current_scope() = 'platform') WITH CHECK (app_current_scope() = 'platform');
CREATE POLICY organization_platform_delete ON "organizations" FOR DELETE
  USING (app_current_scope() = 'platform');

-- Réglages et intégrations de plateforme : lisibles partout (identité de
-- l'application, clé d'envoi d'email chiffrée), modifiables par la plateforme.
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_read ON "platform_settings" FOR SELECT USING (true);
CREATE POLICY platform_write ON "platform_settings" FOR ALL
  USING (app_current_scope() = 'platform') WITH CHECK (app_current_scope() = 'platform');

ALTER TABLE "platform_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_integrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_read ON "platform_integrations" FOR SELECT USING (true);
CREATE POLICY platform_write ON "platform_integrations" FOR ALL
  USING (app_current_scope() = 'platform') WITH CHECK (app_current_scope() = 'platform');

-- Journal d'audit : ajout seul (aucune policy UPDATE/DELETE), lecture réservée
-- à la plateforme.
ALTER TABLE "platform_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_append ON "platform_audit_logs" FOR INSERT WITH CHECK (true);
CREATE POLICY audit_platform_read ON "platform_audit_logs" FOR SELECT
  USING (app_current_scope() = 'platform');

-- login_attempts : compteurs anonymisés (empreintes SHA-256) de limitation de
-- débit, sans donnée de tenant — volontairement hors RLS.
