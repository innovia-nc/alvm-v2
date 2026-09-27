/**
 * DÉVELOPPEMENT UNIQUEMENT — simule l'API Resend pour vérifier la file
 * `alvm-email` sans vraie clé ni envoi réel (docs/file-emails.md).
 *
 *   FAKE_RESEND=fail|ok NODE_OPTIONS="--import ./scripts/dev/fake-resend.mjs" pnpm dev:worker
 *
 * `fail` : le fournisseur répond 503 (tentatives puis FAILED) ; `ok` : 200.
 * Seules les requêtes vers api.resend.com sont interceptées ; rien n'est
 * actif sans préchargement explicite. Journalise l'enveloppe, jamais le corps.
 */
/* global process, URL, Buffer, console, Response -- globales Node 22 (script hors TypeScript) */
const mode = process.env.FAKE_RESEND === 'ok' ? 'ok' : 'fail';
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('https://api.resend.com/')) return realFetch(input, init);

  const body = JSON.parse(String(init?.body ?? '{}'));
  const attachments = (body.attachments ?? [])
    .map((a) => `${a.filename}(${Buffer.from(a.content, 'base64').subarray(0, 5).toString()}…)`)
    .join(', ');
  console.log(
    `[fake-resend:${mode}] to=${body.to} subject="${body.subject}" pièces jointes=${attachments || '-'}`,
  );
  if (mode === 'fail') return new Response('upstream unavailable', { status: 503 });
  return new Response(JSON.stringify({ id: `fake-${Date.now()}` }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
