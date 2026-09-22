# Correctifs des issues #35 à #90

Base de travail : `296b1cd` (`origin/master`). Les 56 issues ouvertes du dépôt `innovia-nc/alvm-v2` ont été analysées et regroupées selon leurs dépendances : accès et stockage, invariants métier/comptables, parcours et listes. Les livrables de l'audit antérieur dans `docs/audit-2026-09-22/` sont des fichiers locaux préexistants, exclus de cette PR.

## Choix métier explicités

- Un STAFF peut activer/réinitialiser un compte PARENT, jamais un compte STAFF/ADMIN. Un administrateur reste nécessaire pour gérer les habilitations. Les conversions de rôle nécessitent un profil actif adapté. Une désactivation conserve les références historiques et invalide les sessions.
- Un adulte est un participant relié à son propre compte client/payeur avec la relation `self`. Il n'a pas de responsable légal fictif. Les noms historiques des tables `children` et `parents` sont conservés pour compatibilité.
- Avant le début d'un camp, le parent peut annuler une inscription en attente non facturée. Sinon sa demande est enregistrée et présentée au personnel pour traitement comptable.
- Une annulation porte uniquement sur les lignes de l'inscription concernée. Les encaissements partiels sont répartis au prorata des prestations restantes. Le choix remboursement immédiat/avoir futur s'applique à la part encaissée ; la part non encaissée est compensée par un avoir simple. Le moyen réel du remboursement est enregistré.
- Les compensations liées à une inscription annulée ne sont pas supprimables isolément. Un règlement par avoir doit être désimputé avant d'annuler la prestation ; le refus est explicite et la transaction est annulée intégralement. Un avoir déjà consommé ne peut pas être annulé sans restaurer ses imputations.
- Toute correction comptable conserve les écritures originales et ajoute une contrepassation datée. Chaque export FEC conserve son contenu, son empreinte SHA-256, sa période et son opérateur ; un ancien export reste téléchargeable à l'identique.
- Les opérations financières et les contrôles de capacité utilisent un verrou transactionnel PostgreSQL commun. Ce choix privilégie les invariants pour le volume de l'association. Il sérialise ces écritures ; une montée en charge devra mesurer l'attente avant d'affiner les verrous par ressource. Les transactions ont un délai maximum de 30 s et un délai d'acquisition de connexion de 15 s.

## Déploiement

1. Sauvegarder la base et tester les migrations sur son clone. Suspendre les écritures le temps de la migration et du remplacement de l'application.
2. Exécuter avec `psql -v ON_ERROR_STOP=1` les fichiers suivants, dans cet ordre :
   - `prisma/migrations-manual/2026-09-22-00-schema.sql` (une fois, depuis le schéma de la base de travail) ;
   - `prisma/migrations-manual/2026-09-22-account-access.sql` ;
   - `prisma/migrations-manual/2026-09-22-business-invariants.sql`.
3. La contrainte partielle d'unicité des inscriptions exige l'absence de doublons actifs. Si elle échoue sur des données historiques, résoudre les doublons avec le responsable métier avant de relancer ; ne pas les supprimer automatiquement. Les séquences sont avancées au-delà des numéros existants. Les journées de camps et statuts de paiement sont recalculés sans modifier les montants historiques.
4. Créer un store Vercel Blob **privé** et fournir `BLOB_PRIVATE_READ_WRITE_TOKEN`. Conserver `BLOB_READ_WRITE_TOKEN` pour les logos publics et le transfert des anciens documents. Exécuter d'abord `pnpm exec tsx scripts/migrate-private-documents.ts` pour l'inventaire, puis `pnpm exec tsx scripts/migrate-private-documents.ts --apply --journal /chemin/protege/migration-documents.jsonl`. Le journal contient les anciennes/nouvelles URL : le conserver hors dépôt avec accès restreint. Le script inclut les archives, vérifie la copie privée octet par octet, met à jour la base, supprime l'ancien objet public et vérifie qu'il n'est plus accessible. Le journal permet de reprendre après une interruption. Attendre l'invalidation CDN et relancer si l'ancien objet reste accessible. Les logos ne sont pas migrés. Les objets orphelins qui ne sont plus référencés en base demandent un inventaire du store distinct.
5. Déployer l'application. Les cookies précédents, dépourvus de version de session, sont invalidés : les utilisateurs se reconnectent. Les téléchargements passent par les routes authentifiées sans cache ; les factures/avoirs sont rendus depuis les données courantes. Les anciens documents publics non migrés sont signalés comme indisponibles.
6. Configurer `AUTH_URL`, `AUTH_SECRET` et les paramètres Resend existants pour la récupération par email. Les jetons de récupération sont aléatoires, stockés sous empreinte, valables 30 minutes et à usage unique. La limitation de connexion utilise PostgreSQL (10 essais/compte et 100/origine sur 15 minutes), avec l'origine attestée par Vercel. Hors Vercel, une limite d'origine commune s'applique. Prévoir un entretien périodique : `DELETE FROM login_attempts WHERE window_start < now() - interval '1 day'`.

Aucune migration, modification de compte, publication ou transmission d'email n'a été effectuée en production. Le transfert Blob réel et la délivrabilité des emails nécessitent les services configurés : ils restent à vérifier sur l'environnement de déploiement. Les tests locaux couvrent les autorisations, les options du SDK et le cycle de vie des jetons.

## Vérifications reproductibles

Les scripts d'intégration refusent une base autre que `127.0.0.1:55446/alvm_fixes`. Données fictives uniquement. Initialiser avec le schéma Prisma puis les migrations `account-access` et `business-invariants`. Créer le dossier `docs/fixes-2026-09-22` avant exécution. Utiliser `POSTGRES_PRISMA_URL=postgresql://postgres@127.0.0.1:55446/alvm_fixes`.

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- `pnpm exec tsx test/integration/audit-regressions.ts` : autorisations, capacité et paiements concurrents, annulations partielles, FIFO, journées/prix exact, présences, participants adultes, FEC et séquences. Produit les fixtures locales dans `/private/tmp`.
- `pnpm exec tsx test/integration/accounting-followups.ts` : révocation/expiration des jetons, protection concurrente du dernier administrateur, réutilisation partielle et annulation des avoirs, restitution d'un avoir issu d'un remboursement.
- `pnpm exec tsx test/integration/adult-flow.ts` : inscription, présence, facture exacte et rendu PDF pour un adulte autonome.
- Démarrer le build avec `AUTH_URL=http://localhost:3026 AUTH_TRUST_HOST=true AUTH_SECRET=<secret-local> pnpm start --port 3026`, puis `node test/integration/browser-regressions.mjs`. `CHROMIUM_PATH` permet d'utiliser un Chromium installé ; sinon le binaire Playwright par défaut est utilisé. Compléter par `node test/integration/mobile-lists.mjs` pour les neuf listes à 390 px et leurs captures. Le script principal ajoute 121 clients fictifs et teste les trois rôles, les PDF, les anciens cookies, les erreurs réseau, le tri serveur et les largeurs 390/767/768/769 px.
- `test/integration/index-plans.sql` s'exécute exclusivement sur `alvm_migrations`, un clone local du schéma initial après migrations. Il crée 100 000 factures fictives et annule toutes ses écritures. Résultat mesuré : 1 725 blocs / 13,194 ms sans les nouveaux index, 103 blocs / 0,201 ms avec l'index parent/type/archive/date. Ce microbenchmark local n'est pas une mesure de latence de production. Les recherches `contains` restent candidates à `pg_trgm` si les plans réels le justifient ; aucun index textuel universel n'est ajouté sans mesure.

Les résultats sont conservés dans les fichiers JSON et `index-plans.txt` de ce dossier. Le lint conserve les avertissements de typage historiques ; aucune erreur bloquante n'est admise.
