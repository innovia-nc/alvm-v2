# FEAT-004 : Tracabilite des factures (cree par / valide par)

> Source CDC : item D6 — effort M — interne (staff/admin)

## Hypothese (discovery)
We believe that **tracer qui a cree et qui a valide chaque facture**
For **les admins/staff ALVM (audit interne, responsabilisation)**
Will result in **une tracabilite des actions sensibles de facturation, utile en cas de controle ou de litige interne**.
We will know we're right when **toute facture creee/validee apres la mise en prod affiche le nom de l'auteur correspondant cote admin/staff**.

## User Story
**En tant que** admin / staff gerant la facturation
**Je veux** voir qui a cree et qui a valide une facture
**Afin de** disposer d'une tracabilite interne des operations de facturation.

## Contexte technique (grounded)
- Migration Prisma requise : 2 champs **optionnels** sur `Invoice` :
  - `createdById String? @db.Uuid` + relation `User` (ex. `@relation("InvoiceCreatedBy")`)
  - `validatedById String? @db.Uuid` + relation `User` (ex. `@relation("InvoiceValidatedBy")`)
- Le contexte tRPC expose `ctx.user.id` (deja utilise dans `invoices.validate`, ~575).
- Remplissage :
  - `create` et `createFromRegistration` -> `createdById = ctx.user.id`
  - `validate` -> `validatedById = ctx.user.id`
- Affichage : detail facture cote admin/staff. **Pas sur le PDF client** ("en interne").
- `prisma db push` / `migrate deploy` sur Supabase (jamais `migrate dev` en prod — cf. CLAUDE.md).

## Criteres d'Acceptation (Gherkin)
- [ ] **Scenario 1 : creation**
      Given je suis staff/admin
      When je cree une facture (create ou createFromRegistration)
      Then `createdById` est renseigne avec mon identifiant utilisateur.

- [ ] **Scenario 2 : validation**
      Given une facture en DRAFT creee par un autre utilisateur
      When je la valide
      Then `validatedById` est renseigne avec MON identifiant (le valideur), sans ecraser `createdById`.

- [ ] **Scenario 3 : affichage detail facture**
      Given une facture creee et validee
      When j'ouvre son detail cote admin/staff
      Then je vois "Cree par : {nom}" et "Valide par : {nom}".

- [ ] **Scenario 4 : factures historiques (retro-compat)**
      Given une facture creee avant cette fonctionnalite
      When j'ouvre son detail
      Then les champs absents affichent un placeholder neutre ("-" / "Non renseigne"), sans erreur.

- [ ] **Scenario 5 : non-exposition PDF / parent**
      Given une facture tracee
      When le PDF est genere ou qu'un parent consulte la facture
      Then les champs cree par / valide par ne sont PAS exposes.

## Regles Metier
- R1 : Champs optionnels (factures existantes non retro-remplies).
- R2 : `validatedById` ne doit pas ecraser `createdById`.
- R3 : Information interne — jamais exposee au parent ni sur le PDF.
- R4 : Exposition via `select` whitelist : ne charger que `{ id, firstName, lastName }` de l'User lie (jamais hashedPassword/tokens).

## Hors Perimetre
- Pas d'historique complet d'audit (qui a modifie quoi/quand au-dela de cree/valide).
- Pas de tracabilite des paiements/avoirs.
- Pas d'affichage sur le PDF client.
- Pas de retro-remplissage des factures existantes.

## Details techniques (indicatif)
- Migration : 2 colonnes nullable + 2 relations User nommees.
- Adapter `create`, `createFromRegistration`, `validate` dans `server/routers/invoices.ts`.
- Adapter l'endpoint de detail (`select` des relations) + le composant detail admin/staff.

## Metriques de Succes
- 100% des nouvelles factures ont `createdById` ; 100% des factures validees ont `validatedById`.
- 0 exposition cote parent/PDF (test de non-regression).

## Estimation
- **Complexite** : M
- **Story Points** : 3
- **Dependances** : aucune bloquante. Touche `Invoice` (migration) — a sequencer proprement avec D8 (FEAT-005) qui touche aussi la facturation, pour eviter des migrations concurrentes mal ordonnees.

## INVEST Check
- [x] Independent
- [x] Negotiable (libelles/emplacement d'affichage)
- [x] Valuable (audit interne)
- [x] Estimable
- [x] Small — 3 SP
- [x] Testable (unit sur remplissage des IDs + E2E affichage + non-exposition)

## Definition of Ready
- [x] Discovery / demande CDC
- [x] Hypothese + metric
- [x] User story
- [x] Criteres Gherkin testables (dont retro-compat + non-exposition)
- [x] Regles metier (select whitelist, pas d'ecrasement)
- [x] Hors perimetre
- [x] Pas de nouvelle UI complexe (2 lignes dans le detail existant)
- [x] Dependances identifiees (sequencement migration)
- [x] <= 8 SP
- [x] INVEST valide
- [x] Pas de TBD critique

**Statut DoR : READY**
