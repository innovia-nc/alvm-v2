# Recette ALVM v2.0.1 — preuve visuelle (Playwright + Chrome)

- **Date d'exécution** : 2026-07-06T19:12+11:00 (Pacific/Noumea)
- **Banc** : clone local de la prod (dump `alvm-prod-backup-20260706.sql` + migrations manuelles d'alignement/seed pricing/code postal), Postgres 17 jetable `alvm-smoke` sur `127.0.0.1:5445`. **Jamais la prod.**
- **App** : `pnpm dev` sur `http://localhost:3000`, code déployé v2.0.1 (HEAD `master`).
- **Personas** : ADMIN (`smoke-admin@test.local`, créé pour la recette) et PARENT (créé pendant la recette, sans code postal).
- **Périmètre** : les 8 guides utilisateurs — connexion & habilitations, camps, familles, inscriptions, présences, facturation & paiements, export FEC.
- **Verdict** : ✅ **19/19 critères PASS**. Recette clôturable.

## Résultats par critère

| # | Critère (parcours utilisateur) | Guide | Verdict | Capture |
|---|---|---|---|---|
| AUTH-01 | Un admin se connecte et voit son tableau de bord | 1 | ✅ PASS | ![](AUTH-login-admin-01.png) |
| AUTH-02 | Un mauvais mot de passe est rejeté avec un message (pas d'accès) | 1 | ✅ PASS | ![](AUTH-mauvais-mdp-01.png) |
| AUTH-03 | Un visiteur non connecté est redirigé vers la connexion | 8 | ✅ PASS | ![](AUTH-redirect-anonyme-01.png) |
| CAMP-01 | L'admin crée un camp publié (5 j / 25 000 XPF) et le retrouve | 2 | ✅ PASS | ![](CAMP-creation-01.png) |
| FAM-01 | L'admin crée un parent **sans code postal** (régression 2.0.1) | 3 | ✅ PASS | ![](FAM-parent-sans-cp-01.png) |
| FAM-02 | L'admin crée un enfant rattaché au **bon** parent | 3 | ✅ PASS | ![](FAM-enfant-cree-01.png) |
| INSCR-01 | L'admin inscrit l'enfant au camp (statut Confirmée) | 4 | ✅ PASS | ![](INSCR-creation-01.png) |
| FACT-01 | Facture depuis l'inscription : 25 000 XPF, **TGC 0** (LP 492) | 6 | ✅ PASS | ![](FACT-creation-tgc0-01.png) |
| FACT-02 | Validation → Émise + **écritures VE équilibrées** (D=C=25 000) | 6 | ✅ PASS | ![](FACT-validation-sent-01.png) |
| PAY-01 | Paiement du solde → facture **Payée** (`paid_amount` = total) | 6 | ✅ PASS | ![](PAY-solde-01.png) · ![](PAY-facture-payee-02.png) |
| PRES-01 | L'enfant inscrit (Confirmé) apparaît sur la feuille de présence | 5 | ✅ PASS | ![](PRES-pointage-01.png) |
| FEC-01 | L'export comptable FEC est généré (fichier téléchargé) | 7 | ✅ PASS | ![](FEC-export-01.png) |
| HAB-01 | La gestion des accès liste les comptes et leurs rôles | 8 | ✅ PASS | ![](HAB-roles-01.png) |
| PAR-01 | Le parent créé se connecte et arrive sur son espace | 1 | ✅ PASS | ![](PAR-login-01.png) |
| PAR-02 | Le parent ne voit **que** ses propres enfants (scoping) | 3 | ✅ PASS | ![](PAR-scoping-enfants-01.png) |
| PAR-03 | Le parent ajoute lui-même un second enfant | 3 | ✅ PASS | ![](PAR-second-enfant-01.png) |
| PAR-04 | Le parent inscrit son enfant au camp publié | 4 | ✅ PASS | ![](PAR-inscription-01.png) |
| PAR-05 | Le parent voit sa facture (et uniquement la sienne) | 6 | ✅ PASS | ![](PAR-factures-01.png) |
| PAR-06 | Le parent est bloqué hors de son espace (admin interdit) | 8 | ✅ PASS | ![](PAR-admin-interdit-01.png) |

## Synthèse

- **19/19 critères PASS** couvrant le parcours métier complet (ADMIN + PARENT) sur clone de prod.
- Les **régressions corrigées en 2.0.1 sont re-prouvées côté UI** : parent sans code postal (FAM-01), TGC exonérée (FACT-01), recalcul du payé (PAY-01), inscription confirmée facturable (INSCR-01 → FACT-01).
- **Invariant comptable** vérifié en base à l'émission : écritures VE équilibrées D=C=25 000, statut PAID avec `paid_amount = total` après paiement.
- **Cloisonnement par rôle** prouvé : anonyme redirigé, parent scoping enfants/factures, accès admin refusé au parent.

## Défaut de recette trouvé (et corrigé dans le scénario)

Un premier scénario FAM-02 passait au vert tout en rattachant l'enfant à un **homonyme de la prod** au lieu du parent RECETTE (sélecteur de carte trop large → faux vert). Corrigé en ciblant le parent par **email unique** + assertion stricte ; la liaison correcte est désormais re-prouvée en aval (INSCR-01 ne trouve l'enfant que sous le bon parent). C'est précisément le type de faux-vert que la recette visuelle doit intercepter (§6.5).

## Rejouer la recette

```bash
# 1. Banc : clone de prod dans un Postgres jetable (voir docs/deploiement.md § campagne)
# 2. pnpm dev
# 3. Recette Playwright :
pnpm exec playwright test --config docs/test-evidence/recette-v2.0.1/playwright.config.ts
```

> Note : le spec interroge la base du banc (`docker exec alvm-smoke psql …`) pour résoudre des ids (facture, camp) et prouver les écritures comptables — usage recette uniquement, jamais contre la prod.
