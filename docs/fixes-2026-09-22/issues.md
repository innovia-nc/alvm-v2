# Couverture des issues

La PR traite les 56 issues ouvertes #35–#90. Les dépendances et limites de déploiement sont décrites dans [README.md](README.md). Les preuves automatisées se trouvent dans les suites unitaires, scripts d’intégration et résultats locaux de ce dossier.

| Issue | Correction et validation |
|---|---|
| [#35](https://github.com/innovia-nc/alvm-v2/issues/35) | Contrôle du rôle cible avant changement de mot de passe ; preuve HTTP et hash inchangé. |
| [#36](https://github.com/innovia-nc/alvm-v2/issues/36) | Identité parent imposée par la session ; propriété vérifiée. |
| [#37](https://github.com/innovia-nc/alvm-v2/issues/37) | Consultation des crédits limitée à la famille connectée. |
| [#38](https://github.com/innovia-nc/alvm-v2/issues/38) | Version de session et vérification serveur du rôle/état ; anciens cookies rejetés. |
| [#39](https://github.com/innovia-nc/alvm-v2/issues/39) | Désactivation commune aux trois parcours, historique conservé. |
| [#40](https://github.com/innovia-nc/alvm-v2/issues/40) | Store privé, routes authentifiées, script de transfert des objets publics ; validation externe requise au déploiement. |
| [#41](https://github.com/innovia-nc/alvm-v2/issues/41) | Compteurs atomiques partagés en PostgreSQL par compte/origine, fenêtre de récupération testée. |
| [#42](https://github.com/innovia-nc/alvm-v2/issues/42) | Verrou des administrateurs, maintien du dernier compte actif, contrôle des profils lors des conversions. |
| [#43](https://github.com/innovia-nc/alvm-v2/issues/43) | Parcours adulte autonome avec compte client/payeur et relation self ; naissance autorisée jusqu’à 120 ans. |
| [#44](https://github.com/innovia-nc/alvm-v2/issues/44) | Mise à jour parent autorisée seulement pour ses participants et les champs prévus. |
| [#45](https://github.com/innovia-nc/alvm-v2/issues/45) | Annulation avant départ ou demande explicite, visible dans les tableaux de bord. |
| [#46](https://github.com/innovia-nc/alvm-v2/issues/46) | PDF enfant autorisé à sa famille, erreurs texte/JSON correctement traitées. |
| [#47](https://github.com/innovia-nc/alvm-v2/issues/47) | Lien de gestion réservé aux parcours où la page existe. |
| [#48](https://github.com/innovia-nc/alvm-v2/issues/48) | Action de paiement remplacée par une consigne de contact exploitable. |
| [#49](https://github.com/innovia-nc/alvm-v2/issues/49) | Création des identifiants Credentials lors de l’activation d’un contact existant. |
| [#50](https://github.com/innovia-nc/alvm-v2/issues/50) | Écran Mon compte et récupération via jeton haché, expirant et à usage unique ; délivrabilité externe non testée. |
| [#51](https://github.com/innovia-nc/alvm-v2/issues/51) | Téléversement de PDF personnel privé et ajout depuis la fiche de modification. |
| [#52](https://github.com/innovia-nc/alvm-v2/issues/52) | Chaînes Unicode corrigées dans les écrans parent. |
| [#53](https://github.com/innovia-nc/alvm-v2/issues/53) | Seuil mobile cohérent 767/768 px. |
| [#54](https://github.com/innovia-nc/alvm-v2/issues/54) | Conteneurs flex réductibles, tableaux contenus et pagination adaptable. |
| [#55](https://github.com/innovia-nc/alvm-v2/issues/55) | Dialogue Radix du menu mobile, libellés, Échap et restitution du focus. |
| [#56](https://github.com/innovia-nc/alvm-v2/issues/56) | Accès Comptes et habilitations dans la navigation administrateur. |
| [#57](https://github.com/innovia-nc/alvm-v2/issues/57) | Priorités reliées aux inscriptions en attente, créances, retards, activités et demandes d’annulation. |
| [#58](https://github.com/innovia-nc/alvm-v2/issues/58) | Contrôle transactionnel de capacité et test concurrent de la dernière place. |
| [#59](https://github.com/innovia-nc/alvm-v2/issues/59) | Compensation limitée aux lignes de l’inscription annulée, facture multi-activités préservée. |
| [#60](https://github.com/innovia-nc/alvm-v2/issues/60) | Avoirs/encaissements/remboursements et contrepassations synchronisés atomiquement. |
| [#61](https://github.com/innovia-nc/alvm-v2/issues/61) | Annulation d’une facture émise impayée avec contrepassation conservée. |
| [#62](https://github.com/innovia-nc/alvm-v2/issues/62) | Choix remboursement/avoir futur pour la part encaissée d’un paiement partiel. |
| [#63](https://github.com/innovia-nc/alvm-v2/issues/63) | Moyen réel du remboursement transmis, validé et utilisé pour le compte de trésorerie. |
| [#64](https://github.com/innovia-nc/alvm-v2/issues/64) | Trigger de synchronisation versionné et testé sur une base sans ancien trigger. |
| [#65](https://github.com/innovia-nc/alvm-v2/issues/65) | Méthode active, avoir obligatoire/cohérent, propriétaire, statut, expiration et soldes contrôlés. |
| [#66](https://github.com/innovia-nc/alvm-v2/issues/66) | Imputation cumulée par upsert et historique des utilisations partielles. |
| [#67](https://github.com/innovia-nc/alvm-v2/issues/67) | Remboursement futur créant un avoir consommable ; annulation possible tant qu’il reste intact. |
| [#68](https://github.com/innovia-nc/alvm-v2/issues/68) | Verrou commun paiement/avoir/facture ; surpaiement concurrent refusé. |
| [#69](https://github.com/innovia-nc/alvm-v2/issues/69) | Propriété, état actif et absence de double facturation vérifiés à la création/modification/émission. |
| [#70](https://github.com/innovia-nc/alvm-v2/issues/70) | Émission centralisée ; transitions PAID/OVERDUE arbitraires interdites. |
| [#71](https://github.com/innovia-nc/alvm-v2/issues/71) | Émission directe par le service commun avec FIFO, validateur et comptabilité. |
| [#72](https://github.com/innovia-nc/alvm-v2/issues/72) | Journées créées/synchronisées dans les transactions de camp, références d’inscription mises à jour. |
| [#73](https://github.com/innovia-nc/alvm-v2/issues/73) | Prix total canonique en base et facturation exacte sur trois jours non divisibles. |
| [#74](https://github.com/innovia-nc/alvm-v2/issues/74) | Unicité partielle des inscriptions actives, réinscription possible après annulation. |
| [#75](https://github.com/innovia-nc/alvm-v2/issues/75) | Annulation d’avoir avec contrepassation et neutralisation du solde, refus si déjà utilisé. |
| [#76](https://github.com/innovia-nc/alvm-v2/issues/76) | PDF téléchargés à partir de la situation courante, cache privé désactivé et anciennes URL invalidées lors des mutations. |
| [#77](https://github.com/innovia-nc/alvm-v2/issues/77) | Suppression des caches de séquences dépendant de transactions annulables ; test après rollback. |
| [#78](https://github.com/innovia-nc/alvm-v2/issues/78) | Retrait des réglages comptables sans effet et indication des conventions réellement appliquées. |
| [#79](https://github.com/innovia-nc/alvm-v2/issues/79) | Retard calculé sur l’échéance en fuseau Nouméa dans les listes, filtres et synthèses. |
| [#80](https://github.com/innovia-nc/alvm-v2/issues/80) | Noms des modèles Prisma corrigés et filtrage réel testé ; contrôles explicites des relations. |
| [#81](https://github.com/innovia-nc/alvm-v2/issues/81) | Projections de listes sans détail de lignes/paiements ni contenu médical complet. |
| [#82](https://github.com/innovia-nc/alvm-v2/issues/82) | Index de filtres/jointures versionnés ; EXPLAIN ANALYZE comparatif sur 100 000 factures. |
| [#83](https://github.com/innovia-nc/alvm-v2/issues/83) | Recherche/pagination serveur dans les sélecteurs et espaces parent ; sélection au-delà de 100. |
| [#84](https://github.com/innovia-nc/alvm-v2/issues/84) | Tri contrôlé côté serveur, pagination réinitialisée et identifiant de départage. |
| [#85](https://github.com/innovia-nc/alvm-v2/issues/85) | Formats numériques fr-FR et dates Pacific/Noumea explicites, recette avec navigateur Europe/Paris. |
| [#86](https://github.com/innovia-nc/alvm-v2/issues/86) | États d’erreur explicites et relance conservant les filtres, simulation réseau dans Chromium. |
| [#87](https://github.com/innovia-nc/alvm-v2/issues/87) | Validation de chaque inscription et des doublons, puis écriture atomique du lot de présences. |
| [#88](https://github.com/innovia-nc/alvm-v2/issues/88) | Écritures de ventes/avoirs réparties par compte de chaque activité, arrondis compensés. |
| [#89](https://github.com/innovia-nc/alvm-v2/issues/89) | Snapshots FEC conservés avec empreinte/opérateur et contrepassations sans effacement des originaux. |
| [#90](https://github.com/innovia-nc/alvm-v2/issues/90) | Synchronisation transactionnelle des emails User/Parent/Staff depuis les habilitations. |
