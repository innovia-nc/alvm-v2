# Parcours navigateur (Playwright) — recette visuelle

Recette E2E de la plateforme (CLAUDE.md InnovIA §6.5 / §6.6) : chaque critère
d'acceptation produit une capture probante `<CRITERE>-<slug>-NN.png`, versée
dans `docs/test-evidence/<recette>/` avec le rapport PASS/FAIL.

| Fichier | Contenu |
|---------|---------|
| `01-recette-alvm.e2e.spec.ts` | 19 critères des 8 guides utilisateurs, dans l'espace `alvm` (ADMIN du seed + PARENT créé pendant la recette) |
| `02-recette-saas.e2e.spec.ts` | multi-tenant : SAAS-01 à SAAS-08, SEC-01 (secret interne du back, hors navigateur) |
| `support/recette.ts` | personas, connexion, sessions réutilisées, captures |
| `support/parcours.ts` | parcours métier (camp, parent, enfant, inscription, facture) partagés |

Projets (`playwright.config.ts`) : `desktop` (1440×900, tous les critères) et
`mobile` (390×844, critères tagués `@mobile` : AUTH-01, AUTH-03, SAAS-04,
SAAS-07). Locale `fr-FR`, fuseau `Pacific/Noumea`, un seul worker : les
critères s'enchaînent (le camp créé est facturé, le parent créé se connecte).

## Banc isolé

`scripts/e2e-stack.sh` (racine du dépôt) monte un banc qui ne touche ni à
`alvm_dev` ni aux serveurs de développement :

| Élément | Valeur par défaut |
|---------|-------------------|
| Base | `alvm_e2e` sur le PostgreSQL du `compose.yml` (127.0.0.1:5436), rôle `alvm_app` non-superuser (RLS réelle) |
| Back | `node dist/main.js` sur :4102 |
| Front | `next build` + `next start` sur :3102 (`E2E_FRONT_MODE=dev` : `next dev`) |
| Secrets | générés au premier lancement dans `$TMPDIR/alvm-e2e/secrets.env` (jamais versionnés) |
| Redis | non branché : l'envoi d'email est désactivé et expliqué à l'écran |

```bash
docker compose up -d                 # PostgreSQL + Redis de développement
scripts/e2e-stack.sh up              # base alvm_e2e (création, migrations, seed), back, front
scripts/e2e-stack.sh test            # recette complète, captures dans docs/test-evidence/recette-saas-3.0.0/
scripts/e2e-stack.sh probe           # SEC-01 au curl (sortie texte versée au même dossier)
scripts/e2e-stack.sh restart         # après une modification du code : rebuild + relance
scripts/e2e-stack.sh down            # arrête back et front ; la base est conservée
scripts/e2e-stack.sh reset           # (banc arrêté) supprime la base alvm_e2e pour repartir de zéro
```

Une recette rejouée sur la même base crée de nouvelles données (suffixe du run,
`E2E_RUN_ID`) : elle reste valable, mais une base neuve (`reset` puis `up`)
reproduit exactement les numéros attendus (SAAS-08 : `FAC-<année>-0001` dans
l'association créée ; la facture d'`alvm` de FACT-01 porte aussi `0001` sur base neuve).

## Variables

| Variable | Rôle |
|----------|------|
| `E2E_BASE_URL` | front testé (défaut `http://localhost:3102`) |
| `E2E_BACK_URL` | back pour SEC-01 (défaut `http://127.0.0.1:4102`) |
| `E2E_EVIDENCE_DIR` | dossier des captures ; absent : sorties de test seulement (`test-results/`) |
| `E2E_RUN_ID` | suffixe des données créées (défaut : horodatage) |
| `E2E_SEED_PASSWORD` | mot de passe des comptes du seed (défaut `Test1234!Seed`) |
| `E2E_CHROMIUM_PATH` | binaire Chromium de secours quand `pnpm exec playwright install chromium` est impossible sur le poste (ex. `~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`) — **jamais en CI** |

## Limitation de débit

Le back compte **toutes** les connexions (10 par compte et 100 par origine par
fenêtre de 15 minutes). La recette ouvre donc chaque session une seule fois par
run (`loginAs`) et `scripts/e2e-stack.sh up` vide `login_attempts` de la base de
recette. Des relances rapprochées peuvent atteindre le quota : relancer `up`.
