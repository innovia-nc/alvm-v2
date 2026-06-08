# BUG-001 : Recherche texte dans les inscriptions ne filtre pas

> Source CDC : item D2 — effort S — Bug front uniquement

## Hypothese (discovery)
We believe that **corriger la recherche texte de la liste des inscriptions**
For **les secretaires / staff qui cherchent une inscription par nom**
Will result in **un acces direct a l'inscription sans scroller / filtrer manuellement**.
We will know we're right when **la saisie d'un nom filtre la liste en <1s et le resultat reste stable (pas de reset de page parasite)**.

## User Story
**En tant que** membre du staff (ou admin) gerant les inscriptions
**Je veux** que la saisie de texte dans le champ de recherche filtre reellement la liste des inscriptions
**Afin de** retrouver rapidement l'inscription d'un enfant, d'un parent ou d'un camp sans dependre uniquement des filtres deroulants.

## Contexte technique (grounded)
- Cause racine : `components/ui/data-table-server.tsx` (lignes ~367-380). Le `useEffect` de debounce a `pagination` dans ses dependances. `pagination` est une reference instable (non memoisee) renvoyee par `hooks/use-server-pagination.ts` -> boucle / reset de page qui parasite l'application du filtre `search`.
- Le back est OK : `server/routers/registrations.ts` (param `search`, `where.OR` insensitive sur child.firstName/lastName/parent/camp) filtre correctement. **Verifie : aucune modification back necessaire.**
- Fix **front uniquement** : stabiliser la reference `pagination` (memoisation dans `use-server-pagination.ts`) et/ou retirer `pagination` des deps du `useEffect` de debounce, sans casser la pagination serveur.

## Criteres d'Acceptation (Gherkin)
- [ ] **Scenario 1 : recherche par nom d'enfant**
      Given je suis staff sur la page liste des inscriptions avec >1 page de resultats
      When je saisis un nom d'enfant existant dans le champ de recherche
      Then la liste se filtre sur les inscriptions correspondantes apres le debounce
      And la page ne se reinitialise pas en boucle pendant la saisie.

- [ ] **Scenario 2 : recherche par nom de parent / camp**
      Given je suis staff sur la liste des inscriptions
      When je saisis un nom de parent ou un libelle de camp
      Then les inscriptions correspondantes s'affichent (matching insensitive a la casse).

- [ ] **Scenario 3 : combinaison recherche + filtre deroulant**
      Given un filtre par statut est actif
      When je saisis un texte de recherche
      Then les deux criteres se cumulent (AND) sans reset parasite du filtre deroulant.

- [ ] **Scenario 4 : effacement de la recherche**
      Given une recherche active filtre la liste
      When j'efface le champ de recherche
      Then la liste complete (filtres deroulants seuls) reapparait, page 1.

- [ ] **Scenario 5 : non-regression pagination**
      Given un resultat de recherche sur plusieurs pages
      When je change de page
      Then la recherche reste appliquee et la bonne page serveur est chargee.

## Regles Metier
- R1 : Le matching back est insensitive a la casse (deja en place, ne pas modifier).
- R2 : Le scope parent existant reste applique (`where.parentId` pour role PARENT) — ne pas le casser.

## Hors Perimetre
- Aucune modification du router back `registrations.ts`.
- Pas de refonte du composant `data-table-server.tsx` au-dela du fix de stabilite de reference.
- Pas d'ajout de nouveaux champs recherchables.

## Metriques de Succes
- Temps de retrouvaille d'une inscription par nom < 5s (vs filtrage manuel actuel).
- 0 reset de page parasite observe pendant la saisie (verifiable en test E2E).

## Estimation
- **Complexite** : S
- **Story Points** : 2
- **Dependances** : aucune

## INVEST Check
- [x] Independent — fix isole, aucune dependance
- [x] Negotiable — strategie de fix (memo vs deps) discutable
- [x] Valuable — debloque une fonction cassee utilisee au quotidien
- [x] Estimable — cause racine identifiee
- [x] Small — 2 SP
- [x] Testable — E2E Playwright sur le filtrage

## Definition of Ready
- [x] Discovery effectue (besoin quotidien confirme CDC)
- [x] Hypothese + metric
- [x] User story redigee
- [x] Criteres Gherkin testables
- [x] Regles metier explicites
- [x] Hors perimetre documente
- [x] Pas de nouvelle UI (pas de maquette requise)
- [x] Dependances : aucune
- [x] Estimee <= 8 SP
- [x] INVEST valide
- [x] Pas de TBD critique

**Statut DoR : READY**
