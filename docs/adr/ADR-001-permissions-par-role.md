# ADR-001 — Modèle de permissions par rôle (EPIC-006, Story 1 — Spike)

- **Statut** : PROPOSÉ — en attente d'arbitrage client (questions Q1–Q7 ci-dessous)
- **Date** : 2026-06-09
- **Story** : EPIC-006 / Story 1 (Spike de cadrage)
- **Contexte de réactivation** : retour de déploiement — « aucune mention ni
  option de gestion des droits d'accès depuis le compte administrateur ».
  EPIC-006 avait été abandonné le 2026-06-08 ; réactivé en mode cadrage
  (Spike → ADR, **pas de code de production**).

> ⚠️ Ce document est un **livrable de cadrage**. Aucune ligne de code de
> production n'est produite par cette story. Le développement effectif
> (modèle de données, enforcement, UI) ne démarre **qu'après validation
> client** des décisions ci-dessous, puis découpage en sous-stories.

---

## 1. Problème

Le client souhaite que l'administrateur puisse **gérer les droits d'accès par
profil** (« l'admin coche les accès : admin / secrétaire / directrice »).
Aujourd'hui, ce mécanisme **n'existe pas** : les droits sont binaires et codés
en dur. Il faut décider du modèle cible avant tout développement.

## 2. État des lieux (constats techniques — grounded)

| Élément | Réalité dans le code | Référence |
|---|---|---|
| Rôles applicatifs | Enum **binaire** `PARENT \| STAFF \| ADMIN` | `prisma/schema.prisma:15` |
| Pas de « secrétaire »/« directrice » | Inexistant | — |
| Table `Permission`/`Role`/association | **Aucune** | — |
| Enforcement actuel | Middlewares tRPC **statiques** par procédure (`staffProcedure` = STAFF+ADMIN, `adminProcedure` = ADMIN) | `server/trpc/init.ts:102-106` |
| `hasPermission()` | Fonction présente mais **morte** (jamais appelée) | `lib/auth/index.ts:33` |
| `animatorProcedure` / `requireStaffRole(['ANIMATOR'])` / `ctx.user.staffRole` | Échafaudage **partiel et mort** : `animatorProcedure` n'est utilisé par **aucun** router, et **aucun enum `StaffRole`** n'existe en base | `server/trpc/init.ts:62-106` |

**Conclusion** : il ne s'agit pas d'activer un mécanisme existant, mais de
**construire un système d'autorisation complet**. Chantier transverse sécurité,
impactant tous les routers sensibles. C'est un **XL**, à décliner en slices.

## 3. Décisions à trancher par le client (bloquantes)

Réponses **recommandées** par défaut (à confirmer/infirmer) :

| # | Question | Recommandation par défaut |
|---|---|---|
| Q1 | Rôles exacts ? | Conserver `PARENT/STAFF/ADMIN` en base et introduire une notion de **profil back-office** (SECRETARY, DIRECTOR…) **au-dessus** de STAFF, sans casser l'auth. |
| Q2 | Granularité permissionnable ? | **Module × action** (ex. `invoices:create`, `registrations:read`) — granularité suffisante, lisible côté UI « cases à cocher ». |
| Q3 | Statique ou dynamique ? | **Matrice rôle → permissions stockée en base et éditable** par l'admin (le client dit « cocher » → dynamique). |
| Q4 | Rôles custom ? | **Non au MVP** : liste de rôles figée (extensible plus tard). Réduit la surface de risque. |
| Q5 | Migration des comptes existants ? | `STAFF` → `SECRETARY` par défaut ; `ADMIN` → rôle `ADMIN` (toutes permissions). Bascule sans interruption (champ additif, valeur par défaut). |
| Q6 | Cumul / hiérarchie ? | **Pas de cumul** au MVP ; un seul rôle par utilisateur. Hiérarchie implicite par jeu de permissions, pas par héritage. |
| Q7 | PARENT dans le système ? | **Hors périmètre** (cas portail famille, géré par `parentProcedure` + scope `parentId`). |

## 4. Options de modèle envisagées

- **Option A — RBAC statique (codé)** : rôles et permissions en dur dans le
  code (extension des middlewares). *Simple, robuste, mais l'admin ne peut rien
  « cocher »* → ne répond pas à la demande client.
- **Option B — RBAC dynamique (matrice en base, éditable)** : tables `Role`,
  `Permission`, `RolePermission` ; l'admin coche les permissions par rôle via
  une UI ; enforcement serveur lit la matrice. *Répond à la demande, complexité
  maîtrisée, surface de risque bornée.* ✅ **Recommandé.**
- **Option C — ABAC par utilisateur** : permissions cochables **par
  utilisateur** (pas par rôle). *Plus flexible mais sur-dimensionné, UI et
  audit plus lourds, risque d'incohérence.* À écarter au MVP.

## 5. Décision proposée

Retenir l'**Option B (RBAC dynamique, matrice rôle→permission éditable)**, avec
granularité **module × action**, liste de rôles figée au MVP, un rôle par
utilisateur, PARENT hors périmètre.

## 6. Conséquences

**Positives** : répond littéralement à la demande (« cocher les accès ») ;
enforcement centralisé ; auditable ; migration additive non destructive.

**Coûts / risques** :
- Enforcement à appliquer sur **tous les routers sensibles** (revue exhaustive
  nécessaire — risque de trou de sécurité si un router est oublié) → prévoir un
  helper `requirePermission('module:action')` unique, et des **tests
  d'isolation** systématiques (condition de Done).
- Le cache de session (JWT NextAuth) doit refléter le rôle ; un changement de
  permissions peut nécessiter un refresh de session → stratégie à définir
  (lecture de la matrice côté serveur à chaque requête, pas depuis le JWT).
- Nettoyage de l'échafaudage mort (`hasPermission`, `animatorProcedure`,
  `staffRole`) à intégrer pour éviter la confusion.

## 7. Découpage proposé (post-validation)

Reprend le découpage SPIDR d'EPIC-006 :
1. **Spike (cette ADR)** — décision documentée. ✅ livrable de cette story.
2. **Data** — migration Prisma (`Role`, `Permission`, `RolePermission`) +
   migration des comptes existants (Q5).
3. **Enforcement serveur** — helper `requirePermission`, application sur tous
   les routers sensibles, seed de la matrice par défaut.
4. **UI admin (lecture)** — écran matrice rôles × permissions.
5. **UI admin (édition / cases à cocher)** — l'admin modifie la matrice.
6. **Audit & tests sécurité** — tests d'isolation/autorisation exhaustifs.

## 8. Prochaine action

PO : faire valider les réponses Q1–Q7 par le client. À réception, ouvrir les
sous-stories 2→6 (estimées individuellement) et démarrer le développement.
**Ne pas développer avant validation.**
