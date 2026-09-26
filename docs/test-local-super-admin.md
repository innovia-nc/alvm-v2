# Tester le super admin en local

L’environnement préparé utilise uniquement une base PostgreSQL Docker de démonstration. L’application écoute sur l’adresse Tailscale de cette machine ; le navigateur doit être connecté au même réseau Tailscale.

- Application : http://100.76.15.100:3101
- Connexion super admin : http://100.76.15.100:3101/auth/super-admin
- Connexion admin, personnel et parent : http://100.76.15.100:3101/auth/signin
- Conteneur : `alvm-super-admin-local`
- Base : `alvm_super_admin_test`, port `127.0.0.1:5446`
- Volume persistant : `alvm-super-admin-local-data`
- Configuration et identifiants du super admin : `.env.local` (non versionné).

Les données de démonstration comprennent 10 camps, 25 enfants, 10 parents, 3 membres du personnel, 50 inscriptions et 6 moyens de paiement. Les comptes de démonstration admin (`admin@alvm.nc`), parent (`martin.dupont@email.nc`) et personnel (`sophie.martin@alvm.nc`) utilisent le mot de passe du seed : `Test1234!`.

## Redémarrer

Depuis la racine du projet, avec Docker/Colima actif :

```sh
docker start alvm-super-admin-local
node node_modules/next/dist/bin/next dev -H 100.76.15.100 -p 3101
```

Next.js charge automatiquement `.env.local`. Le port 3101 est utilisé car le port 3000 est déjà occupé. Les commandes utilisent directement les dépendances installées, sans téléchargement de pnpm.

## Parcours conseillé

1. Ouvrir le portail super admin et vérifier le nom de l’application, les intégrations, les comptes techniques et le journal d’audit. Le super admin ne peut pas ouvrir les données métier.
2. Ouvrir une fenêtre de navigation privée pour se connecter en admin.
3. Désactiver « Camps / ACM » côté super admin et actualiser la fenêtre admin : la rubrique est masquée et les accès directs sont bloqués.
4. Réactiver ce module.
5. Désactiver « Application » : les espaces métier deviennent indisponibles, l’espace super admin reste accessible.
6. Réactiver « Application » à la fin.

Les fenêtres séparées évitent de remplacer la session super admin par la session admin.

Les services externes de stockage de fichiers et d’envoi d’emails ne sont pas configurés dans cet environnement. Les tests de rôles, de configuration et de disponibilité des modules sont utilisables sans ces services.

La configuration de l’entreprise (organisation, logo, tarifs, documents, emails et comptabilité) se trouve dans l’espace admin. Le super admin configure uniquement la plateforme. Les clés techniques sont chiffrées avec la clé locale conservée dans `.env.local`.
