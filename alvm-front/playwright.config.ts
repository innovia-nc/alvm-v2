import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours navigateur (CLAUDE.md InnovIA §6.5 / §6.6) — recette visuelle.
 *
 * Cible un front déjà démarré (banc isolé : `scripts/e2e-stack.sh up`, voir
 * `tests/e2e/README.md`) : aucune dépendance à un chemin local.
 *
 *   E2E_BASE_URL        front à tester                 (défaut http://localhost:3102)
 *   E2E_BACK_URL        back (contrôle hors navigateur du secret interne)
 *   E2E_EVIDENCE_DIR    dossier des captures probantes (absent : sorties de test seules)
 *   E2E_CHROMIUM_PATH   binaire Chromium de secours quand `playwright install`
 *                       n'est pas disponible sur le poste (jamais en CI)
 */
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;

// Identifiant du passage : suffixe des données créées (camp, parent, association),
// hérité par les workers — il survit à leur redémarrage après un échec.
process.env.E2E_RUN_ID ??= Date.now().toString(36);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.spec\.ts$/,
  // Parcours métier enchaînés (le camp créé est facturé, le parent créé se
  // connecte…) : un seul worker, fichiers et tests dans l'ordre.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3102',
    locale: 'fr-FR',
    timezoneId: 'Pacific/Noumea',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Critères clés (tag @mobile) rejoués au format téléphone : aucune donnée
      // créée, ils ne dépendent pas de l'ordre des projets.
      name: 'mobile',
      grep: /@mobile/,
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
