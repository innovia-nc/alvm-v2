# FEAT-003 : Historique des inscriptions par enfant

> Source CDC : item D1 — effort M — juge ESSENTIEL par le client

## Hypothese (discovery)
We believe that **afficher l'historique des inscriptions sur la fiche enfant**
For **le staff/admin au quotidien et les parents consultant leur enfant**
Will result in **une vision immediate du parcours de l'enfant (camps passes/presents) sans naviguer vers la liste des inscriptions**.
We will know we're right when **la section "Inscriptions" est consultee sur la fiche enfant et le besoin de croiser manuellement les listes disparait**.

## User Story
**En tant que** staff/admin (et parent pour ses propres enfants)
**Je veux** voir sur la fiche enfant l'historique de ses inscriptions (camps, dates, statut)
**Afin de** connaitre rapidement le parcours de l'enfant sans rechercher dans la liste globale des inscriptions.

## Contexte technique (grounded)
- Back **deja existant** : `registrations.list` accepte un `childId` (`server/routers/registrations.ts` ~173) et applique le scope parent (`where.parentId = ctx.user.id` si role PARENT). **Pas de migration, pas de nouveau endpoint.**
- Manque cote front :
  - `components/admin/children/child-details.tsx` (utilise par fiches **admin + staff**) : aucune section "Inscriptions".
  - `app/dashboard/parent/children/[id]/page.tsx` (page **parent** SSR) : aucune section "Inscriptions".
- A faire : creer un composant d'historique reutilisable + l'injecter dans les 3 contextes (admin / staff / parent).
- Cote parent : SSR -> appeler le router via `createCaller` (cf. `lib/trpc/server.ts`).

## Criteres d'Acceptation (Gherkin)
- [ ] **Scenario 1 : enfant avec inscriptions (admin/staff)**
      Given je suis staff/admin sur la fiche d'un enfant ayant des inscriptions
      When la fiche s'affiche
      Then une section "Inscriptions" liste ses inscriptions avec camp, dates et statut, triees (recentes d'abord).

- [ ] **Scenario 2 : enfant sans inscription**
      Given je consulte la fiche d'un enfant sans aucune inscription
      When la fiche s'affiche
      Then la section "Inscriptions" affiche un etat vide explicite ("Aucune inscription").

- [ ] **Scenario 3 : contexte parent (scope)**
      Given je suis un parent connecte consultant la fiche d'un de MES enfants
      When la page s'affiche
      Then je vois l'historique des inscriptions de cet enfant uniquement.

- [ ] **Scenario 4 : isolation parent (securite)**
      Given je suis parent
      When je tente d'acceder a la fiche/historique d'un enfant qui n'est pas le mien
      Then l'acces est refuse (scope `where.parentId` cote serveur), aucune donnee d'un autre parent n'est exposee.

- [ ] **Scenario 5 : statut lisible**
      Given une inscription au statut PENDING / CONFIRMED / CANCELLED / WAITLIST
      When elle s'affiche dans l'historique
      Then le statut est presente sous forme de libelle/badge lisible (pas la valeur brute).

## Regles Metier
- R1 : Mono-tenant, parent-scoped — un parent ne voit QUE ses enfants (deja garanti back, a verifier en test).
- R2 : Tri par defaut : inscription la plus recente en premier.
- R3 : Reutiliser `registrations.list({ childId })` — aucune nouvelle requete back.

## Hors Perimetre
- Pas de modification/annulation d'inscription depuis cette section (lecture seule).
- Pas de pagination avancee si volume faible (limite raisonnable suffit ; pagination simple si > limite).
- Pas d'export.
- Pas de nouveau champ en base.

## Details techniques (indicatif)
- Composant `components/admin/children/child-registrations-history.tsx` (ou equivalent), props `childId`.
- Injection : `child-details.tsx` (admin/staff) + `app/dashboard/parent/children/[id]/page.tsx` (SSR `createCaller`).

## Metriques de Succes
- Section affichee sur 100% des fiches enfant (3 contextes).
- Aucune fuite cross-parent (test d'isolation vert).

## Estimation
- **Complexite** : M
- **Story Points** : 5
- **Dependances** : aucune bloquante. FEAT-002 (libelles) preferablement avant pour eviter un re-touch du titre de section.

## INVEST Check
- [x] Independent
- [x] Negotiable (densite d'affichage discutable)
- [x] Valuable (juge essentiel client)
- [x] Estimable
- [x] Small — 5 SP, tient dans un sprint
- [x] Testable (E2E par contexte + test d'isolation)

## Definition of Ready
- [x] Discovery (besoin essentiel CDC)
- [x] Hypothese + metric
- [x] User story
- [x] Criteres Gherkin testables (dont securite)
- [x] Regles metier + scope parent
- [x] Hors perimetre (lecture seule)
- [x] Maquette : section liste simple, pattern existant (CardTitle + table/liste) — OK sans wireframe dedie
- [x] Dependances identifiees
- [x] <= 8 SP
- [x] INVEST valide
- [x] Pas de TBD critique

**Statut DoR : READY**
