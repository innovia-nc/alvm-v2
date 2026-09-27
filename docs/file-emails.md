# File d'emails `alvm-email` (BullMQ + Redis)

Conformité CLAUDE.md InnovIA §5.11 : l'envoi d'email est un traitement
asynchrone. L'API **programme**, un **worker** séparé **envoie**.

## Chaîne

```
invoices.sendEmail / account.requestReset          (API, alvm-back)
  ├─ préconditions : RESEND_API_KEY (ou clé super admin), REDIS_URL, module email, destinataire, expéditeur
  ├─ enqueueEmail() — EN DERNIER dans la transaction du tenant
  │    1. INSERT email_messages (QUEUED)            ← RLS : ligne du tenant
  │    2. Queue.add('alvm-email', job)              ← échec = rollback de la ligne
  └─ réponse : { status: 'QUEUED', recipient, emailMessageId }

worker (node dist/worker.js)                         (même image, processus séparé)
  ├─ withDbContext({ scope: 'tenant', organizationId })   ← tenant porté par le job
  ├─ relit la ligne : absente → réessai (jamais d'envoi) ; SENT/FAILED → ignorée
  ├─ compose depuis l'état courant (PDF de facture régénéré, identité d'expédition)
  ├─ envoie via email.service.ts (Resend) HORS transaction
  └─ met à jour la ligne : SENT + sent_at + provider_message_id,
       ou attempts/last_error (FAILED à la 3e tentative ou sur erreur définitive)
```

| Élément                                   | Valeur                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nom de la file                            | `alvm-email` (convention `{projet}-{type}`, jamais de `:`)                                                    |
| Tentatives                                | 3, backoff exponentiel 15 s puis 30 s ; 1re tentative différée d'1 s (laisse le COMMIT se faire)              |
| Rétention Redis                           | job réussi supprimé ; job en échec gardé 7 j / 500 max — sauf réinitialisation (lien secret) : supprimé       |
| Payload                                   | `organizationId`, `emailMessageId`, `kind` (+ `resetUrl`, `expiresAt` pour une réinitialisation)              |
| Erreurs définitives (FAILED sans réessai) | facture supprimée, module email coupé, lien de réinitialisation expiré                                        |
| Débit                                     | 2 envois/s (limite par défaut de Resend), concurrence 2                                                       |
| Historique                                | table `email_messages` (RLS tenant) — `invoices.emailHistory`, carte « Envois par email » de la fiche facture |

Garantie « au moins une fois » : si l'envoi réussit mais que la mise à jour de
la ligne échoue, le réessai peut produire un doublon. Le corps et les jetons ne
sont jamais persistés ni journalisés.

## Variables d'environnement

`REDIS_URL` — requise en production (le boot échoue sinon), optionnelle en dev :
sans elle, tout envoi échoue en `PRECONDITION_FAILED` explicite et
`settings.isEmailConfigured` renvoie `configured: false` (boutons désactivés).
Redis injoignable à l'envoi : `SERVICE_UNAVAILABLE` après 5 s au plus.
Le worker valide le même environnement que l'API (`loadEnv`) et refuse un rôle
base superuser/BYPASSRLS en production.

## Commandes

```bash
# Worker en local (Redis du compose : redis://127.0.0.1:6380)
pnpm --filter @alvm/back dev:worker          # tsx watch src/worker.ts
pnpm --filter @alvm/back start:worker        # après build : node dist/worker.js

# Tests unitaires (file simulée) et intégration contre un vrai Redis
pnpm --filter @alvm/back test
pnpm --filter @alvm/back test:integration:email-queue   # Redis absent = échec, jamais un saut
```

## Vérification locale sans vraie clé Resend

Sur une base à soi (jamais `alvm_dev` partagée, jamais la prod) :

```bash
docker exec alvm-postgres-1 psql -U postgres -c "CREATE DATABASE alvm_email_queue" \
  -c "GRANT CONNECT ON DATABASE alvm_email_queue TO alvm_app"
cd alvm-back
export DATABASE_URL=postgresql://alvm_app:alvm_app@127.0.0.1:5436/alvm_email_queue
DATABASE_MIGRATION_URL=postgresql://postgres:postgres@127.0.0.1:5436/alvm_email_queue pnpm db:migrate
pnpm db:seed
export REDIS_URL=redis://127.0.0.1:6380 RESEND_API_KEY=re_factice EMAIL_FROM_ADDRESS=noreply@plateforme.test \
  AUTH_URL=http://localhost:3100 AUTH_SECRET=<32+ caractères> INTERNAL_API_SECRET=<32+ caractères>

# Fournisseur simulé : FAKE_RESEND=fail (503) ou ok (200) — scripts/dev/fake-resend.mjs
FAKE_RESEND=fail NODE_OPTIONS="--import ./scripts/dev/fake-resend.mjs" pnpm dev:worker
```

Déclencher un envoi (écran facture « Envoyer par email », page « Mot de passe
oublié », ou un appel des procédures), puis suivre la ligne :

```sql
SELECT kind, status, attempts, last_error, provider_message_id, sent_at
FROM email_messages ORDER BY created_at;
```

Attendu avec `FAKE_RESEND=fail` : `attempts` 1 → 2 → 3 en ~45 s, puis `FAILED`
avec `last_error = Le fournisseur d'email a refusé l'envoi (HTTP 503).` Avec
`FAKE_RESEND=ok` : `SENT` en une tentative, pièce jointe `%PDF-…` dans le journal
du worker. Sans le préchargement, une clé factice mène au même `FAILED` (Resend
répond 401). `kill -TERM <pid du worker>` : « fin des envois en cours puis arrêt ».

## Déploiement

Le worker est un **second service** de la même image back :
commande `node dist/worker.js`, mêmes variables que l'API (dont `REDIS_URL`),
pas de port exposé. Redis 7 sur le réseau Docker Coolify, jamais exposé.
