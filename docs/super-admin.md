# Super administration de la plateforme

Connexion : `/auth/super-admin`. Espace : `/dashboard/super-admin`.

## Séparation des responsabilités

`SUPER_ADMIN` n’hérite d’aucun droit métier. Les pages de l’entreprise, les procédures tRPC (y compris les procédures simplement authentifiées) et les routes HTTP de documents refusent ce rôle. Aucun lien vers la gestion métier n’apparaît dans sa navigation.

Le super admin gère les fonctionnalités, l’identité de l’application, les intégrations techniques, les identités de connexion et le journal d’audit. Il conserve son accès même lorsque l’application est suspendue.

L’admin de l’entreprise gère son organisation, son logo, sa tarification, sa comptabilité, ses mentions documentaires, l’identité d’expédition de ses emails, ses types d’ACM et ses moyens de règlement. Les données déjà enregistrées sont conservées. Les réglages techniques de plateforme ne sont pas accessibles par le routeur de paramètres métier.

Les comptes techniques exposent exclusivement nom, email, rôle, état et date de création. Aucun profil parent/personnel ou lien vers une fiche métier n’est retourné. Le super admin peut créer un autre super admin, modifier un nom, activer/désactiver un accès et révoquer des sessions. Il ne peut ni créer un compte métier, ni remplacer son email de connexion ou son mot de passe pour en prendre le contrôle. Les comptes métier restent créés et administrés par l’entreprise. Seules les adresses des autres super admins sont modifiables dans cet espace. Le changement de rôle d’un compte existant et la récupération de son mot de passe ne sont pas proposés depuis cet écran. Son propre compte et le dernier compte actif de chaque rôle administrateur sont protégés.

L’application reste une installation pour une entreprise ; cette séparation de rôles ne crée pas une architecture multientreprise.

## Configuration réellement consommée

| Réglage | Utilisation après enregistrement |
| --- | --- |
| Nom et description de l’application | Connexion, navigation, en-tête, titre et métadonnées HTML ; nom dans les emails de récupération de mot de passe |
| Email de support | Liens de contact sur les écrans de connexion et d’erreur |
| Fonctionnalités | Contrôle de chaque requête métier tRPC et des routes de documents ; navigation actualisée toutes les 15 secondes |
| Clé Resend et activation | Disponibilité du service, envois de factures et récupération de mot de passe |
| Jeton Vercel Blob public et activation | Dépôt et suppression des logos |
| Jeton Vercel Blob privé et activation | Dépôt, génération, téléchargement et suppression des documents privés |
| État d’un compte | Refus de connexion et invalidation des sessions via `sessionVersion` |
| Organisation et mentions documentaires (admin) | Factures et PDF via `getPdfSettings` ; logo des factures via `invoice-pdf.service` |
| Taux, échéance, validité des avoirs, inactivité des moyens de paiement (admin) | Helpers de tarification et services métier existants |
| SIREN (admin) | Nommage des exports FEC |

Les clés d’intégration sont relues à chaque appel : aucun redémarrage n’est nécessaire pour les remplacer ou les désactiver. Une ligne désactivée en base prime sur une clé encore présente dans l’environnement. Sans ligne enregistrée, les variables historiques restent utilisables. Un champ de clé laissé vide conserve la clé existante ; sa suppression est une action explicite qui désactive également l’intégration.

Les champs sans effet ont été retirés de la saisie : le code société n’était pas consommé. La devise XPF est désormais présentée comme fixe, conformément aux formats et calculs existants. Les anciennes valeurs sont conservées en base mais ne sont plus présentées comme des réglages actifs.

Le nom de la plateforme n’altère pas le nom de l’entreprise sur ses factures.

## Secrets et audit

Les clés sont chiffrées avec AES-256-GCM avant écriture dans `platform_integrations`. Les API ne renvoient ni clé en clair, ni valeur chiffrée : seulement l’état et la provenance. Définir une clé `PLATFORM_ENCRYPTION_KEY` de 32 octets encodée en base64 (`openssl rand -base64 32`) et la conserver dans le gestionnaire de secrets lors des redéploiements. Sa rotation nécessite de rechiffrer les clés existantes.

`platform_audit_logs` enregistre les connexions, les échecs de mot de passe connus, les changements d’identité plateforme, de fonctionnalités, d’intégrations et de comptes techniques, ainsi que les réinitialisations de mot de passe et les changements de compte personnel. Les écritures de configuration et leurs événements sont dans la même transaction. Le journal ne contient jamais de mot de passe, de clé API ou de corps de requête métier. L’interface est en lecture seule et paginée. Il ne remplace pas un journal comptable de l’entreprise.

La base de données, `AUTH_SECRET`, `AUTH_URL` et la clé de chiffrement restent des paramètres de démarrage dans l’environnement. L’écran Configuration indique leur état sans exposer leurs secrets.

Le bouton de vérification des intégrations ne modifie ni fichier ni email. Pour Resend, la vérification lit l’API des domaines ; une clé limitée à l’envoi peut refuser cette lecture sans être inutilisable pour envoyer. Voir les [permissions des clés Resend](https://github.com/resend/resend-skills/blob/main/skills/resend/references/api-keys.md). Pour Vercel Blob, le test emploie le [SDK officiel](https://vercel.com/docs/vercel-blob/using-blob-sdk) et ne retourne aucun nom ni contenu de fichier à l’opérateur.

## Paiements en ligne

Aucune passerelle de paiement en ligne n’existait dans le dépôt. Les méthodes de paiement existantes servent à enregistrer des règlements reçus. L’écran Intégrations indique cet état explicitement : aucune clé de paiement n’est enregistrée sans connecteur consommateur.

Le prestataire doit être précisé (par exemple PayZen/ePayNC ou Stripe) avant de relier ses identifiants, la création de paiements, les notifications signées et la confirmation comptable. Une simple saisie de clé ne constitue pas une intégration de paiement.

## Installation

1. Appliquer `prisma/migrations-manual/2026-09-26-super-admin.sql` puis `prisma/migrations-manual/2026-09-26-platform.sql` sur la base cible, après validation sur un clone.
2. Définir `PLATFORM_ENCRYPTION_KEY` dans l’environnement serveur.
3. Générer le client Prisma et construire l’application : `pnpm build`.
4. Pour le premier compte, définir `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, éventuellement `SUPER_ADMIN_NAME`, puis exécuter `pnpm db:create-super-admin`. Le script refuse une adresse déjà utilisée.

L’environnement de test local a reçu ces tables et sa propre clé de chiffrement. Les instructions d’accès et de redémarrage sont dans [test-local-super-admin.md](test-local-super-admin.md).

## Vérifications effectuées

- 1 087 tests unitaires réussis, TypeScript et compilation de production réussis.
- Dans le navigateur, sur `http://100.76.15.100:3101` : connexion réelle, refus des pages/API/documents métier pour le super admin, refus des API plateforme pour l’admin, maintien des réglages entreprise chez l’admin.
- Changement du nom et de la description, ouverture d’une session anonyme et contrôle du titre navigateur ; nom ALVM rétabli après le test.
- Événement de modification présent dans le journal d’audit en base.
- Désactivation d’un compte personnel déjà connecté : sa session est immédiatement invalidée ; compte réactivé après le test.
- Vérification mobile sans débordement de l’écran Intégrations.
- Tests de propagation des clés chiffrées vers Resend et Vercel Blob, de désactivation prioritaire sur l’environnement, de remplacement sans cache et d’absence de secrets dans les réponses/journaux. Les appels fournisseurs sont simulés dans ces tests : aucune clé réelle ni transaction réelle n’a été utilisée.
