# FEAT-002 : Refonte des libelles "Parent/Client" et "Enfant/Stagiaire"

> Source CDC : item D7 — effort S

## Hypothese (discovery)
We believe that **renommer les titres de sections "Parent" en "Parent / Client" et "Enfant" en "Enfant / Stagiaire"**
For **les utilisateurs ALVM (staff, admin)**
Will result in **une terminologie alignee sur le vocabulaire metier du client (client = payeur, stagiaire = participant)**.
We will know we're right when **tous les titres de sections concernes affichent la nouvelle formulation et aucune valeur technique n'est cassee**.

## User Story
**En tant que** utilisateur ALVM (staff / admin)
**Je veux** voir les titres de sections "Parent / Client" et "Enfant / Stagiaire"
**Afin de** retrouver le vocabulaire metier valide par l'association.

## Contexte technique (grounded)
- Pas d'i18n : chaines en dur.
- ~23 occurrences de **titres** dans ~18 fichiers : `PageHeader title=`, `CardTitle`, sidebar `components/layout/dashboard-sidebar.tsx`, pages admin ET staff (dupliquees).
- Remplacements :
  - "Parent" -> "Parent / Client"
  - "Enfant" -> "Enfant / Stagiaire"
  (uniquement dans les **titres de sections**, au pluriel/singulier selon le contexte d'affichage existant).

## Criteres d'Acceptation (Gherkin)
- [ ] **Scenario 1 : titre de section Parent (admin)**
      Given je suis admin sur une page comportant un titre de section "Parent"/"Parents"
      When la page s'affiche
      Then le titre affiche "Parent / Client" (resp. "Parents / Clients").

- [ ] **Scenario 2 : titre de section Enfant (admin + staff)**
      Given je suis sur une page admin ou staff comportant un titre "Enfant"/"Enfants"
      When la page s'affiche
      Then le titre affiche "Enfant / Stagiaire" (resp. "Enfants / Stagiaires").

- [ ] **Scenario 3 : sidebar**
      Given la sidebar de navigation est affichee
      When je consulte les entrees concernees
      Then les libelles de navigation reflettent la nouvelle terminologie.

- [ ] **Scenario 4 : valeurs techniques inchangees (non-regression)**
      Given des en-tetes de colonnes de tableaux, des badges de role (value="PARENT") et des valeurs techniques
      When les pages s'affichent
      Then ces elements ne sont PAS modifies.

## Regles Metier
- R1 : Modifier UNIQUEMENT les titres de sections (PageHeader, CardTitle, sidebar).
- R2 : NE PAS toucher : headers de colonnes de tableaux, badges de role (`value="PARENT"`), enums, valeurs techniques, identifiants.
- R3 : Couvrir les pages admin ET staff (versions dupliquees).

## Hors Perimetre
- Pas d'introduction d'i18n.
- Pas de modification des en-tetes de colonnes ni des libelles de filtres/donnees.
- Pas de renommage en base ni dans les enums.

## Metriques de Succes
- 100% des titres de sections cibles mis a jour (grep de controle avant/apres).
- 0 regression sur les valeurs techniques (badges, enums, colonnes).

## Estimation
- **Complexite** : S
- **Story Points** : 2
- **Dependances** : aucune (cosmetique). A coordonner si D1/D6 ajoutent de nouveaux titres (negligeable).

## INVEST Check
- [x] Independent
- [x] Negotiable (formulation exacte confirmable)
- [x] Valuable (alignement metier)
- [x] Estimable
- [x] Small — 2 SP
- [x] Testable (assertions de texte E2E + grep)

## Definition of Ready
- [x] Discovery / demande CDC explicite
- [x] Hypothese + metric
- [x] User story
- [x] Criteres Gherkin testables
- [x] Regles metier + perimetre strict (ce qui NE bouge PAS)
- [x] Hors perimetre
- [x] Pas de nouvelle UI
- [x] Dependances : aucune
- [x] <= 8 SP
- [x] INVEST valide
- [x] Pas de TBD critique

**Statut DoR : READY**

> Note : la formulation exacte ("Parent / Client" avec espaces autour du slash) est l'hypothese par defaut.
> Confirmation cosmetique aupres du client souhaitable mais NON bloquante (n'invalide pas la DoR).
