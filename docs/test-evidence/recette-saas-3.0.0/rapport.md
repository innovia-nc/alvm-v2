# Recette Asso SaaS 3.0.0 — preuve visuelle (Playwright + Chromium)

- **Date d'exécution** : 2026-09-27, 12:25 (Pacific/Noumea), run `rc3`.
- **Code recetté** : branche `feat/saas-e2e-acceptance` = `refonte/saas-multi-tenant`
  (e1b23d1 : file d'emails, audit `select`, tests d'intégration, déploiement)
  + les deux correctifs issus de cette recette (voir « Défauts trouvés »).
- **Banc isolé** (`scripts/e2e-stack.sh up`) : base **neuve** `alvm_e2e`
  (PostgreSQL 16 du `compose.yml`, rôle applicatif `alvm_app` NOSUPERUSER
  NOBYPASSRLS : RLS réelle), migrations + seed de démonstration ; back
  `node dist/main.js` en `NODE_ENV=production` sur :4102 (file d'emails dans une
  base Redis dédiée, sans worker) ; front `next build` + `next start` sur :3102.
  Ni `alvm_dev` ni les serveurs de développement ne sont touchés. **Jamais la prod.**
- **Navigateur** : Chromium headless shell (Playwright 1.58.2), locale `fr-FR`,
  fuseau `Pacific/Noumea` ; projet `desktop` 1440×900 et projet `mobile`
  390×844 (Pixel 7) pour 4 critères clés, avec contrôle d'absence de
  débordement horizontal.
- **Personas** : super admin, ADMIN et parents du seed (`alvm`, `asso-demo`),
  PARENT créé pendant la recette, association « Recette SaaS rc3 » et son
  premier ADMIN créés pendant la recette.
- **Verdict** : ✅ **32/32 tests PASS** — 19 critères portés de la v2.0.1 +
  8 critères multi-tenant + SEC-01, dont 4 rejoués au format téléphone.
  **Deux défauts applicatifs trouvés et corrigés** avant l'exécution finale.

La recette v2.0.1 (mono-tenant, clone de prod) reste archivée telle quelle dans
`../recette-v2.0.1/`.

## 1. Portage des 19 critères v2.0.1 (espace `alvm`)

| # | Scénario (Given / When / Then) | Guide | Verdict | Capture(s) |
|---|---|---|---|---|
| AUTH-01 | Étant donné l'admin du seed, quand il se connecte avec l'identifiant d'espace `alvm`, alors il arrive sur son tableau de bord, en-tête « Espace ALVM (démonstration) » | 1 | ✅ PASS (desktop + mobile) | ![](AUTH-01-login-admin-01.png) · ![](AUTH-01-login-admin-01-mobile.png) |
| AUTH-02 | Quand le mot de passe est faux, alors « Espace, email ou mot de passe incorrect » s'affiche et l'utilisateur reste sur la connexion | 1 | ✅ PASS | ![](AUTH-02-mauvais-mdp-01.png) |
| AUTH-03 | Étant donné un visiteur anonyme, quand il ouvre `/dashboard/admin/invoices`, alors il est redirigé vers la connexion (champ « Identifiant de l'espace ») | 8 | ✅ PASS (desktop + mobile) | ![](AUTH-03-redirect-anonyme-01.png) · ![](AUTH-03-redirect-anonyme-01-mobile.png) |
| CAMP-01 | Quand l'admin crée un camp publié de 5 jours à 25 000 XPF, alors il le retrouve par la recherche et sa fiche affiche le prix | 2 | ✅ PASS | ![](CAMP-01-creation-01.png) |
| FAM-01 | Quand l'admin crée un parent **sans code postal**, alors la fiche du parent s'ouvre (régression 2.0.1) | 3 | ✅ PASS | ![](FAM-01-parent-sans-cp-01.png) |
| FAM-02 | Quand l'admin crée un enfant en choisissant le parent **par son email**, alors la carte du parent sélectionné affiche cet email et la fiche de l'enfant cite ce parent | 3 | ✅ PASS (après correctif n° 1) | ![](FAM-02-enfant-cree-01.png) |
| INSCR-01 | Quand l'admin inscrit l'enfant au camp avec le statut « Confirmée », alors l'inscription apparaît « Confirmée » dans la liste | 4 | ✅ PASS | ![](INSCR-01-creation-01.png) |
| FACT-01 | Quand l'admin facture l'inscription non payée, alors le brouillon affiche HT 25 000, **Taxes (0 %) : 0 XPF** (LP 492), TTC 25 000 | 6 | ✅ PASS | ![](FACT-01-creation-tgc0-01.png) |
| FACT-02 | Quand l'admin valide la facture, alors elle passe « Émise » et porte le numéro `FAC-2026-0001` | 6 | ✅ PASS | ![](FACT-02-validation-emise-01.png) |
| PAY-01 | Quand l'admin enregistre un virement de 25 000 XPF, alors le paiement est listé et la facture passe « Payée » | 6 | ✅ PASS | ![](PAY-01-solde-01.png) · ![](PAY-01-facture-payee-02.png) |
| PRES-01 | Étant donné l'enfant inscrit « Confirmée », quand l'admin ouvre l'onglet Présences du camp et le marque « Présent », alors le compteur passe à 1/1 présents | 5 | ✅ PASS | ![](PRES-01-pointage-01.png) |
| FEC-01 | Quand l'admin exporte le FEC de l'année, alors le fichier `123456789FEC20261231.txt` est téléchargé et les écritures **VE** de la facture sont équilibrées D = C = 25 000 (lu dans le fichier, extrait ci-dessous) | 7 | ✅ PASS | ![](FEC-01-export-01.png) |
| HAB-01 | Quand l'admin ouvre « Comptes et habilitations », alors les comptes et leurs rôles sont listés | 8 | ✅ PASS | ![](HAB-01-roles-01.png) |
| PAR-01 | Quand le parent créé en FAM-01 se connecte (espace `alvm`), alors il arrive sur son espace parent | 1 | ✅ PASS | ![](PAR-01-login-01.png) |
| PAR-02 | Alors il ne voit que son enfant (aucun Dupont / Leblanc / Bernard du seed) | 3 | ✅ PASS | ![](PAR-02-scoping-enfants-01.png) |
| PAR-03 | Quand il ajoute lui-même un second enfant, alors l'enfant apparaît dans « Mes enfants » | 3 | ✅ PASS | ![](PAR-03-second-enfant-01.png) |
| PAR-04 | Quand il inscrit ce second enfant au camp publié depuis la fiche du camp, alors la confirmation « Inscription réussie » s'affiche (la capture montre l'inscription « En attente » à côté de celle confirmée par l'admin) | 4 | ✅ PASS | ![](PAR-04-inscription-01.png) |
| PAR-05 | Alors « Mes factures » montre sa facture de 25 000 XPF « Payée » | 6 | ✅ PASS | ![](PAR-05-factures-01.png) |
| PAR-06 | Quand il ouvre `/dashboard/admin/invoices`, alors il est renvoyé vers son espace parent | 8 | ✅ PASS | ![](PAR-06-admin-interdit-01.png) |

Extrait du FEC téléchargé (FEC-01) — écritures de vente de la facture :

```
JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|…
VE|Journal de ventes|VE202609270001|20260927|411000|Clients|AUX237640ea|Client - FAC-2026-0001|FAC-2026-0001|20260927|Facture FAC-2026-0001|25000,00|0,00|…
VE|Journal de ventes|VE202609270001|20260927|706400|Ventes|||FAC-2026-0001|20260927|Facture FAC-2026-0001|0,00|25000,00|…
```

## 2. Critères multi-tenant

| # | Scénario (Given / When / Then) | Verdict | Capture(s) |
|---|---|---|---|
| SAAS-01 | Étant donné le super admin (`/auth/super-admin`), quand il crée « Recette SaaS rc3 » (identifiant proposé `recette-saas-rc3`) avec son premier admin, alors l'association apparaît « Active » et son détail liste ce compte | ✅ PASS | ![](SAAS-01-formulaire-01.png) · ![](SAAS-01-association-creee-02.png) · ![](SAAS-01-premier-admin-03.png) |
| SAAS-02 | Quand le nouvel admin ouvre `/o/recette-saas-rc3`, alors la connexion a l'espace prérempli et affiche le nom « Recette SaaS rc3 » ; une fois connecté, enfants, camps, factures et parents sont **vides** (aucune donnée d'alvm) | ✅ PASS | ![](SAAS-02-lien-espace-01.png) · ![](SAAS-02-espace-vide-02.png) |
| SAAS-03 | Étant donné des identifiants de fiches d'alvm relevés dans l'interface d'alvm (enfant Lucas Dupont, camp « Stage Football Intensif », facture FAC-2026-0001), quand l'admin d'asso-demo consulte ses listes, alors il ne voit que Paul Dupont et « Stage découverte — Koné », la recherche du numéro de facture d'alvm ne renvoie rien ; quand il ouvre les URL des fiches d'alvm, alors « Élément introuvable » / « ACM introuvable » | ✅ PASS | ![](SAAS-03-enfants-asso-demo-01.png) · ![](SAAS-03-facture-alvm-absente-02.png) · ![](SAAS-03-fiche-enfant-alvm-introuvable-03.png) · ![](SAAS-03-fiche-facture-alvm-introuvable-04.png) |
| SAAS-04 | Étant donné `martin.dupont@familles.test` dans deux espaces, quand il se connecte dans `alvm` puis dans `asso-demo`, alors il voit Lucas, Emma et Léa d'un côté, Paul seul de l'autre | ✅ PASS (desktop + mobile) | ![](SAAS-04-famille-alvm-01.png) · ![](SAAS-04-famille-asso-demo-02.png) · ![](SAAS-04-famille-alvm-01-mobile.png) · ![](SAAS-04-famille-asso-demo-02-mobile.png) |
| SAAS-05 | Étant donné l'admin de SAAS-01 connecté, quand le super admin suspend l'association, alors le rechargement renvoie l'admin à la connexion et sa reconnexion est refusée ; quand le super admin réactive, alors **le cookie d'avant la suspension ne rouvre pas la session** (révocation définitive) et l'admin se reconnecte | ✅ PASS (après correctif n° 2) | ![](SAAS-05-association-suspendue-01.png) · ![](SAAS-05-session-revoquee-02.png) · ![](SAAS-05-reconnexion-refusee-03.png) · ![](SAAS-05-association-reactivee-04.png) · ![](SAAS-05-reconnexion-apres-reactivation-05.png) |
| SAAS-06 | Quand le super admin désactive le module « Factures » d'asso-demo, alors la rubrique disparaît du menu d'asso-demo et `/dashboard/admin/invoices` affiche « Fonctionnalité indisponible », tandis qu'alvm garde ses factures ; quand il réactive, alors la rubrique revient chez asso-demo sans reconnexion | ✅ PASS | ![](SAAS-06-module-factures-desactive-01.png) · ![](SAAS-06-menu-asso-demo-sans-factures-02.png) · ![](SAAS-06-factures-indisponibles-asso-demo-03.png) · ![](SAAS-06-factures-alvm-inchangees-04.png) · ![](SAAS-06-factures-reactivees-asso-demo-05.png) |
| SAAS-07 | Quand le super admin ouvre des pages métier (`/dashboard/admin`, `…/children`, `…/invoices`, `/dashboard/staff/camps`, `/dashboard/parent/invoices`), alors il est renvoyé vers « Associations » ; et l'API métier lui répond **403 FORBIDDEN** (ci-dessous) | ✅ PASS (desktop + mobile) | ![](SAAS-07-pages-metier-redirigees-01.png) · ![](SAAS-07-pages-metier-redirigees-01-mobile.png) |
| SAAS-08 | Étant donné qu'alvm a déjà émis `FAC-2026-0001`, quand le nouvel admin crée type d'ACM, camp, parent, enfant, inscription puis valide la facture, alors elle porte **`FAC-2026-0001`** (numérotation propre à l'association) | ✅ PASS | ![](SAAS-08-factures-alvm-01.png) · ![](SAAS-08-premiere-facture-0001-02.png) |

Réponse de l'API métier à la session super admin (SAAS-07, pièce jointe du test) :

```
GET /api/trpc/children.list (session super admin) → HTTP 403
{"error":{"json":{"message":"La super administration ne donne pas accès aux données métier.","code":-32003,"data":{"code":"FORBIDDEN","httpStatus":403,"path":"children.list","zodError":null}}}}
```

## 3. SEC-01 — secret interne du back (hors navigateur)

Vérifié deux fois : par le test Playwright `SEC-01` (contexte `request`, sans
navigateur — PASS) et au curl (`scripts/e2e-stack.sh probe`,
[`SEC-01-back-secret-interne.txt`](SEC-01-back-secret-interne.txt)) :

```
$ curl -si http://127.0.0.1:4102/api/health
HTTP/1.1 200 OK
{"status":"ok","version":null}

$ curl -si http://127.0.0.1:4102/api/trpc/organizations.publicInfo?input=…            # sans secret
HTTP/1.1 403 Forbidden
{"error":"Accès réservé au front de la plateforme"}

$ curl -si -H "x-internal-secret: <forgé>" http://127.0.0.1:4102/api/trpc/organizations.publicInfo?input=…
HTTP/1.1 403 Forbidden
{"error":"Accès réservé au front de la plateforme"}

$ curl -si -X POST http://127.0.0.1:4102/api/internal/auth/credentials -d {…}              # sans secret
HTTP/1.1 403 Forbidden
{"error":"Accès réservé au front de la plateforme"}

$ curl -si -H "x-internal-secret: <secret du banc>" http://127.0.0.1:4102/api/trpc/organizations.publicInfo?input=…   # témoin
HTTP/1.1 200 OK
{"result":{"data":{"json":{"slug":"alvm","name":"ALVM (démonstration)","logoUrl":null}}}}
```

Le test Playwright couvre en plus `GET /api/generate/…` sans secret → 403.

## 4. Défauts trouvés par la recette (corrigés)

| # | Défaut | Cause | Correctif | Test associé |
|---|---|---|---|---|
| 1 | **FAM-02** — à la création d'un enfant, la carte du parent sélectionné est **vide** (ni nom, ni email, ni téléphone) : l'opérateur ne peut pas vérifier qu'il a choisi le bon parent parmi des homonymes (le faux vert de la recette v2.0.1 venait exactement de là) | `components/staff/children/child-form.tsx` ne gardait que `parentId` / `isPrimary` / `relationship` et rendait la carte avec des chaînes vides (depuis la migration du front, e73bc70) | `fix(front)` 46575d3 : identité conservée à part, contrat `children.create` inchangé | `alvm-front/test/unit/child-form-parents.spec.tsx` (rouge avant, vert après) ; FAM-02 |
| 2 | **SAAS-05** — la suspension ne faisait que **bloquer** les sessions : après réactivation, le cookie émis **avant** la suspension rouvrait le tableau de bord de l'admin sans nouvelle authentification (contraire à « La suspension révoque les sessions ») | `organizations.setStatus` changeait le statut sans toucher `sessionVersion` ; `isSessionValid` ne refusait que pendant la suspension | `fix(back)` 1757896 : la suspension incrémente `sessionVersion` de tous les comptes de l'association, dans la transaction de plateforme | `alvm-back/test/unit/organizations.spec.ts` (3 tests, rouge avant, vert après) ; SAAS-05 sur PostgreSQL réel + RLS |

## 5. Observations non bloquantes (non corrigées)

- **Fiche facture** (`components/admin/invoices/invoice-details.tsx`) : le badge
  « Brouillon » est coupé sur deux lignes (« Brouillo / n ») à 1440 px, et le
  sous-titre de page affiche « Émise le … » pour un brouillon (FACT-01).
  Cosmétique ; piste : `whitespace-nowrap` sur le badge de l'en-tête, libellé
  « Créée le » tant que la facture est en brouillon.
- **Listes** enfants / factures : le nom n'est pas un lien, l'accès à la fiche
  passe par le menu « … » → « Voir détails » (les camps, eux, sont des liens).
- Hors banc de production (`NODE_ENV` ≠ `production`), tRPC renvoie la pile
  d'appels dans ses erreurs ; les images Docker et les compose posent
  `NODE_ENV=production`, et le banc de recette aussi désormais.

## 6. Résumé Playwright (exécution finale)

```
Running 32 tests using 1 worker
  ✓   1 [desktop] › 01-recette-alvm.e2e.spec.ts › AUTH-01 — un admin se connecte (espace alvm) et voit son tableau de bord @mobile (2.9s)
  ✓   2 [desktop] › 01-recette-alvm.e2e.spec.ts › AUTH-02 — un mauvais mot de passe est rejeté avec un message (1.2s)
  ✓   3 [desktop] › 01-recette-alvm.e2e.spec.ts › AUTH-03 — un visiteur non connecté est redirigé vers la connexion @mobile (692ms)
  ✓   4 [desktop] › 01-recette-alvm.e2e.spec.ts › CAMP-01 — l’admin crée un camp publié (5 j / 25 000 XPF) et le retrouve (1.4s)
  ✓   5 [desktop] › 01-recette-alvm.e2e.spec.ts › FAM-01 — l’admin crée un parent SANS code postal (régression 2.0.1) (1.2s)
  ✓   6 [desktop] › 01-recette-alvm.e2e.spec.ts › FAM-02 — l’admin crée un enfant rattaché au BON parent (2.9s)
  ✓   7 [desktop] › 01-recette-alvm.e2e.spec.ts › INSCR-01 — l’admin inscrit l’enfant au camp (statut Confirmée) (1.6s)
  ✓   8 [desktop] › 01-recette-alvm.e2e.spec.ts › FACT-01 — facture créée depuis l’inscription : 25 000 XPF, TGC 0 (LP 492) (2.0s)
  ✓   9 [desktop] › 01-recette-alvm.e2e.spec.ts › FACT-02 — la validation passe la facture en « Émise » (1.8s)
  ✓  10 [desktop] › 01-recette-alvm.e2e.spec.ts › PAY-01 — le paiement du solde passe la facture en « Payée » (2.2s)
  ✓  11 [desktop] › 01-recette-alvm.e2e.spec.ts › PRES-01 — l’enfant inscrit (Confirmée) apparaît sur la feuille de présence (1.4s)
  ✓  12 [desktop] › 01-recette-alvm.e2e.spec.ts › FEC-01 — l’export FEC est généré ; les écritures VE de la facture sont équilibrées (1.4s)
  ✓  13 [desktop] › 01-recette-alvm.e2e.spec.ts › HAB-01 — la gestion des accès liste les comptes et leurs rôles (861ms)
  ✓  14 [desktop] › 01-recette-alvm.e2e.spec.ts › PAR-01 — le parent créé se connecte et arrive sur son espace (3.4s)
  ✓  15 [desktop] › 01-recette-alvm.e2e.spec.ts › PAR-02 — le parent ne voit que ses propres enfants (776ms)
  ✓  16 [desktop] › 01-recette-alvm.e2e.spec.ts › PAR-03 — le parent ajoute lui-même un second enfant (1.2s)
  ✓  17 [desktop] › 01-recette-alvm.e2e.spec.ts › PAR-04 — le parent inscrit son enfant au camp publié (1.3s)
  ✓  18 [desktop] › 01-recette-alvm.e2e.spec.ts › PAR-05 — le parent voit sa facture (et uniquement la sienne) (758ms)
  ✓  19 [desktop] › 01-recette-alvm.e2e.spec.ts › PAR-06 — le parent est bloqué hors de son espace (admin interdit) (843ms)
  ✓  20 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-01 — le super admin crée une association et son premier admin (2.5s)
  ✓  21 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-02 — le nouvel admin se connecte via /o/<identifiant> et trouve un espace vide (3.6s)
  ✓  22 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-03 — isolation : l’admin d’asso-demo ne voit ni ne peut ouvrir les fiches d’alvm (5.4s)
  ✓  23 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-04 — même email dans deux espaces : deux familles distinctes @mobile (3.1s)
  ✓  24 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-05 — suspendre l’association révoque la session de son admin et refuse la reconnexion (4.3s)
  ✓  25 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-06 — désactiver « Factures » chez asso-demo masque la rubrique chez elle seule (4.1s)
  ✓  26 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-07 — le super admin n’a accès à aucune page métier @mobile (1.1s)
  ✓  27 [desktop] › 02-recette-saas.e2e.spec.ts › SAAS-08 — numérotation par association : première facture = FAC-<année>-0001 (7.4s)
  ✓  28 [desktop] › 02-recette-saas.e2e.spec.ts › SEC-01 — hors navigateur : le back refuse toute requête sans secret interne (403) (9ms)
  ✓  29 [mobile] › 01-recette-alvm.e2e.spec.ts › AUTH-01 — un admin se connecte (espace alvm) et voit son tableau de bord @mobile (1.4s)
  ✓  30 [mobile] › 01-recette-alvm.e2e.spec.ts › AUTH-03 — un visiteur non connecté est redirigé vers la connexion @mobile (764ms)
  ✓  31 [mobile] › 02-recette-saas.e2e.spec.ts › SAAS-04 — même email dans deux espaces : deux familles distinctes @mobile (4.3s)
  ✓  32 [mobile] › 02-recette-saas.e2e.spec.ts › SAAS-07 — le super admin n’a accès à aucune page métier @mobile (1.1s)

  32 passed (1.2m)
```

`expected: 32, unexpected: 0, flaky: 0, skipped: 0` — aucun test escamoté.

## 7. Rejouer la recette

```bash
docker compose up -d
scripts/e2e-stack.sh reset && scripts/e2e-stack.sh up   # base alvm_e2e neuve, back :4102, front :3102
scripts/e2e-stack.sh test                               # captures dans ce dossier
scripts/e2e-stack.sh probe                              # SEC-01 au curl
scripts/e2e-stack.sh down                               # la base est conservée
```

Poste sans `playwright install` complet : `E2E_CHROMIUM_PATH=<binaire chromium>`
(voir `alvm-front/tests/e2e/README.md`). Aucune lecture de la base par les
tests : tout ce qui est prouvé passe par l'écran ou par un fichier que l'écran
fait télécharger (FEC).
