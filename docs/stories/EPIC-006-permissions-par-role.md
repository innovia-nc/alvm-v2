# EPIC-006 : Tableau de gestion des permissions par role

> Source CDC : item D5 — effort XL — SECURITE — **CONSTRUCTION FROM SCRATCH**
> **STATUT : NON-READY — EPIC a decouper. Decisions client manquantes.**

## Constat technique (grounded — IMPORTANT)
Ce systeme **n'a jamais existe** dans le codebase :
- L'enum actuel est **binaire** : `UserRole { PARENT, STAFF, ADMIN }` (`prisma/schema.prisma` ~15-21).
- **Aucun** role "secretaire" / "directrice".
- **Aucune** table `Permission` / `Role` / association.
- Une fonction morte `hasPermission()` existe dans `lib/auth/index.ts` mais **n'est appelee nulle part**.

=> Il ne s'agit PAS d'activer un mecanisme existant mais de **construire un systeme de permissions complet** (modele de donnees, garde-fous serveur sur TOUS les routers sensibles, UI d'administration). C'est un chantier XL et **transverse securite**.

## Pourquoi NON-READY
La demande client ("l'admin coche les acces par profil : admin / secretaire / directrice") melange plusieurs decisions structurantes non tranchees. Specifier/dev sans ces reponses = risque de refonte securite mal calibree (sur ou sous-dimensionnee), avec impact sur l'isolation et la migration des comptes existants.

## QUESTIONS CLIENT a trancher AVANT tout dev (bloquantes)
1. **Roles exacts** : garde-t-on `STAFF`/`ADMIN` ou introduit-on `SECRETARY` / `DIRECTOR` ? Liste exhaustive et definition de chaque role ?
2. **Granularite** : qu'est-ce qui est permissionnable ? Par **module** (factures, inscriptions, enfants...) ? Par **action CRUD** (lire/creer/modifier/supprimer) ? Combinaison module x action ?
3. **Statique vs dynamique** : permissions **par role** (statiques, codees) ou **par utilisateur** (cochables dynamiquement dans une UI admin) ? Le client cite "cocher" -> tend vers dynamique, a confirmer.
4. **Roles custom** : l'admin peut-il **creer** de nouveaux roles, ou choisit-il dans une liste figee ?
5. **Migration des comptes existants** : les users `STAFF` actuels deviennent quoi ? (ex. STAFF -> SECRETARY par defaut ?) Les `ADMIN` ? Strategie de bascule sans interruption.
6. **Heritage / cumul** : un utilisateur peut-il avoir plusieurs roles ? Y a-t-il une hierarchie (DIRECTOR > SECRETARY) ?
7. **Perimetre PARENT** : le role PARENT reste-t-il hors de ce systeme (cas particulier portail famille) ? (hypothese : oui).

## Decoupage SPIDR propose (a affiner apres reponses client)
> Le decoupage final depend des reponses ci-dessus. Proposition de slices verticaux et incrementaux :

- **STORY 1 — Spike (S)** : cadrage technique. Choisir le modele (RBAC statique vs ABAC/cochable), evaluer l'impact sur tous les routers sensibles, produire un ADR. *Livrable : decision documentee, pas de code prod.*
- **STORY 2 — Data + roles (M)** : migration Prisma du modele de roles/permissions retenu + migration des comptes existants. *Slice : le modele existe et les users sont migres, sans UI.*
- **STORY 3 — Enforcement serveur (L)** : appliquer les garde-fous de permission cote serveur sur les routers sensibles (procedures tRPC). *Slice : la securite est reelle, controlable par seed/config, meme sans UI.*
- **STORY 4 — UI admin lecture (M)** : ecran admin affichant la matrice roles x permissions (lecture seule). *Slice : visualisation.*
- **STORY 5 — UI admin edition / cochable (L)** : l'admin modifie les permissions (si decision = dynamique). *Slice : edition.*
- **STORY 6 — Audit & tests securite (M)** : tests d'isolation/autorisation exhaustifs + revue OWASP. *Transverse, condition de Done de l'epic.*

Patterns SPIDR utilises : **S**pike (story 1), **D**ata (story 2), **R**ules/enforcement (story 3), **I**nterfaces (stories 4/5 lecture puis edition).

## Criteres d'acceptation
NON DEFINISSABLES de maniere testable a ce stade : ils dependent des reponses client (roles, granularite, statique/dynamique). Seront rediges par sous-story une fois le cadrage fait.

## Hors Perimetre (deja)
- Refonte de l'authentification NextAuth elle-meme (hors champ).
- Permissions pour le role PARENT (cas portail famille, hors de ce systeme — hypothese).

## Estimation
- **Complexite** : XL
- **Story Points** : NON ESTIMABLE en l'etat (>13 -> a decouper obligatoirement). Re-estimer chaque sous-story apres cadrage.
- **Dependances** : transverse securite — impacte tous les routers sensibles. A traiter sur un chantier dedie, pas melange aux quick wins.

## INVEST Check (au niveau EPIC)
- [ ] Independent — transverse, impacte tout le back
- [ ] Negotiable — oui mais perimetre flou
- [x] Valuable — oui (demande client forte)
- [ ] Estimable — NON tant que les questions client ne sont pas tranchees
- [ ] Small — NON (XL, a decouper)
- [ ] Testable — NON en l'etat

## Definition of Ready
- [x] Valeur identifiee
- [ ] Discovery complet — **NON** (decisions client manquantes)
- [ ] Hypothese mesurable — **NON**
- [ ] Criteres Gherkin — **NON**
- [ ] Estimee <= 8 SP — **NON** (XL)
- [ ] Maquette UI admin — **NON** (depend de statique/dynamique)
- [ ] Migration des users existants definie — **NON**

**Statut DoR : NON-READY — EPIC bloque sur decisions client.**
> Action PO : envoyer la liste de questions 1-7 au client. A reception, decliner en sous-stories (decoupage SPIDR ci-dessus) et estimer. NE PAS lancer en dev avant le Spike (Story 1).
