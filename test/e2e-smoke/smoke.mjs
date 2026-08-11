/**
 * Campagne de tests réels (smoke E2E) — à lancer contre une app pointant sur
 * un CLONE de la prod (jamais la prod elle-même : le script écrit des données).
 *
 * Usage :
 *   1. Restaurer un dump de prod dans un Postgres local, créer les comptes de
 *      test (voir docs/deploiement.md § campagne smoke), pointer .env.local dessus.
 *   2. pnpm dev
 *   3. node test/e2e-smoke/smoke.mjs
 *
 * Vérifie les flux d'écriture métier de bout en bout (inscription → facture →
 * paiements → remboursement → avoir → FEC) et les invariants comptables.
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const DB = process.env.SMOKE_DB_URL || 'postgresql://postgres:smoke@127.0.0.1:5445/neondb';
const ADMIN = { email: 'smoke-admin@test.local', password: 'Smoke2026!' };

const prisma = new PrismaClient({ datasourceUrl: DB });
const results = [];

function check(section, name, ok, detail = '') {
  results.push({ section, name, ok, detail: String(detail).slice(0, 220) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${section}] ${name}${ok ? '' : '  ← ' + detail}`);
}

// ---------------------------------------------------------------------------
// HTTP helpers (cookie jar minimal + tRPC superjson-light)
// ---------------------------------------------------------------------------
function jarFrom(res, jar = {}) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function login(email, password) {
  const jar = {};
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  jarFrom(csrfRes, jar);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  jarFrom(res, jar);
  const sess = await (await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } })).json();
  return { jar, session: sess?.user ?? null };
}

async function trpc(method, proc, input, jar) {
  const opts = { headers: { Cookie: jar ? cookieHeader(jar) : '' } };
  let res;
  if (method === 'GET') {
    res = await fetch(`${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, opts);
  } else {
    res = await fetch(`${BASE}/api/trpc/${proc}`, {
      ...opts, method: 'POST',
      headers: { ...opts.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    });
  }
  const body = await res.json().catch(() => null);
  return {
    status: res.status,
    data: body?.result?.data?.json ?? null,
    error: body?.error?.json ?? null,
  };
}
const q = (proc, input, jar) => trpc('GET', proc, input, jar);
const m = (proc, input, jar) => trpc('POST', proc, input, jar);

// ---------------------------------------------------------------------------
// Campagne
// ---------------------------------------------------------------------------
async function main() {
  // ————— A. Authentification & authz —————
  const admin = await login(ADMIN.email, ADMIN.password);
  check('auth', 'login admin', admin.session?.role === 'ADMIN', JSON.stringify(admin.session));
  const bad = await login(ADMIN.email, 'MauvaisMotDePasse1!');
  check('auth', 'mauvais mot de passe rejeté', !bad.session, JSON.stringify(bad.session));
  const anon = await q('invoices.list', { limit: 1, offset: 0 }, null);
  check('auth', 'tRPC sans session → UNAUTHORIZED', anon.status === 401, `http ${anon.status}`);

  // ————— B. Création parent (staff) puis login avec ce compte —————
  const suffix = Math.random().toString(36).slice(2, 7);
  const newParent = await m('parents.create', {
    firstName: 'Smoke', lastName: 'Famille', email: `smoke-famille-${suffix}@test.local`,
    phone: '687000', password: 'FamilleSmoke1!',
  }, admin.jar);
  check('parents', 'création parent par staff', !!newParent.data?.id, JSON.stringify(newParent.error ?? newParent.data));
  const parentId = newParent.data?.id;
  const famLogin = await login(`smoke-famille-${suffix}@test.local`, 'FamilleSmoke1!');
  check('parents', 'login du parent créé', famLogin.session?.role === 'PARENT', JSON.stringify(famLogin.session));
  const badCp = await m('parents.create', {
    firstName: 'Smoke', lastName: 'BadCp', email: `smoke-badcp-${suffix}@test.local`,
    phone: '687001', postalCode: 'ABC',
  }, admin.jar);
  check('parents', 'code postal invalide rejeté proprement (Zod, pas 500)',
    badCp.error?.data?.code === 'BAD_REQUEST', `code=${badCp.error?.data?.code} http=${badCp.status}`);

  // ————— C. Enfant —————
  const child = await m('children.create', {
    firstName: 'Enfant', lastName: 'Smoke', birthDate: '2018-05-10T00:00:00.000Z', gender: 'FEMALE',
    parents: [{ parentId, isPrimary: true }],
  }, admin.jar);
  check('children', 'création enfant lié au parent', !!child.data?.id, JSON.stringify(child.error ?? child.data));
  const childId = child.data?.id;
  const adultChild = await m('children.create', {
    firstName: 'Trop', lastName: 'Vieux', birthDate: '2000-01-01T00:00:00.000Z', gender: 'MALE',
    parents: [{ parentId, isPrimary: true }],
  }, admin.jar);
  check('children', 'enfant > 18 ans rejeté proprement (pas 500 Postgres)',
    !!adultChild.error && adultChild.error?.data?.code !== 'INTERNAL_SERVER_ERROR',
    `code=${adultChild.error?.data?.code ?? 'créé:' + JSON.stringify(adultChild.data?.id)}`);
  const famChildren = await q('children.list', { limit: 10, offset: 0 }, famLogin.jar);
  check('children', 'scoping parent : voit son enfant et rien que les siens',
    famChildren.data?.children?.length === 1 && famChildren.data.children[0].id === childId,
    `total=${famChildren.data?.total}`);

  // ————— D. Camp —————
  const camp = await m('camps.create', {
    name: `Camp Smoke ${suffix}`, description: 'Camp de test de la campagne smoke',
    campTypeId: (await q('camps.listCampTypes', undefined, admin.jar)).data?.[0]?.id,
    location: 'Nouméa', maxCapacity: 2,
    startDate: '2026-09-01', endDate: '2026-09-05', registrationDeadline: '2026-08-25',
    totalPrice: 25000, status: 'PUBLISHED',
  }, admin.jar);
  check('camps', 'création camp 5 j / 25 000 XPF', !!camp.data?.id, JSON.stringify(camp.error ?? camp.data).slice(0, 200));
  const campId = camp.data?.id;
  check('camps', 'pricePerDay = 5000 (totalPrice / daysCount)', camp.data?.pricePerDay === 5000, `pricePerDay=${camp.data?.pricePerDay}`);

  // ————— E. Inscription par le parent —————
  const reg = await m('registrations.create', { campId, childId }, famLogin.jar);
  check('registrations', 'parent inscrit son enfant', !!reg.data?.id, JSON.stringify(reg.error ?? reg.data).slice(0, 200));
  const regId = reg.data?.id;
  const dup = await m('registrations.create', { campId, childId }, famLogin.jar);
  check('registrations', 'double inscription rejetée', !!dup.error, JSON.stringify(dup.data ?? dup.error?.message));
  const foreign = await m('registrations.create', { campId, childId: '00000000-0000-4000-a000-000000000000' }, famLogin.jar);
  check('registrations', "enfant d'un autre parent / inexistant rejeté", !!foreign.error, JSON.stringify(foreign.data));

  // ————— F. Facture depuis inscription —————
  const inv = await m('invoices.createFromRegistration', { registrationId: regId }, admin.jar);
  check('invoices', 'createFromRegistration', !!inv.data?.id, JSON.stringify(inv.error ?? '').slice(0, 200));
  check('invoices', 'montants : 5 j × 5000 = 25 000, TGC 0 (LP 492)',
    inv.data?.subtotalHt === 25000 && inv.data?.taxAmount === 0 && inv.data?.totalAmount === 25000,
    `HT=${inv.data?.subtotalHt} TGC=${inv.data?.taxAmount} TTC=${inv.data?.totalAmount}`);
  const invId = inv.data?.id;

  // ————— G. Validation + écritures VE —————
  const val = await m('invoices.validate', { id: invId }, admin.jar);
  check('invoices', 'validation → SENT', val.data?.status === 'SENT', JSON.stringify(val.error ?? val.data?.status));
  const reval = await m('invoices.validate', { id: invId }, admin.jar);
  check('invoices', 'revalidation rejetée (PRECONDITION)', reval.error?.data?.code === 'PRECONDITION_FAILED', JSON.stringify(reval.error?.data?.code ?? reval.data));
  const ve = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(sum(debit),0) d, COALESCE(sum(credit),0) c, count(*) n FROM accounting_entries WHERE invoice_id = $1::uuid`, invId);
  check('compta', 'écritures VE équilibrées (D = C = 25 000)',
    Number(ve[0].d) === 25000 && Number(ve[0].c) === 25000 && Number(ve[0].n) === 2, JSON.stringify(ve[0], (k, v) => typeof v === 'bigint' ? Number(v) : v));

  // ————— H. Paiements —————
  const pmList = (await q('paymentMethods.list', undefined, admin.jar)).data ?? [];
  const pm = Object.fromEntries(pmList.map((p) => [p.code, p.id]));
  check('payments', 'méthodes de paiement disponibles', !!pm.CHECK && !!pm.CASH, Object.keys(pm).join(','));

  const overpay = await m('payments.create', { invoiceId: invId, amount: 999999, paymentDate: '2026-07-06', paymentMethodId: pm.CHECK }, admin.jar);
  check('payments', 'surpaiement (999 999 > 25 000) rejeté', !!overpay.error, `data=${JSON.stringify(overpay.data)?.slice(0, 120)}`);

  const p1 = await m('payments.create', { invoiceId: invId, amount: 10000, paymentDate: '2026-07-06', paymentMethodId: pm.CHECK, reference: 'CHQ-SMOKE-1' }, admin.jar);
  check('payments', 'paiement partiel 10 000 (chèque)', !!p1.data?.id, JSON.stringify(p1.error ?? '').slice(0, 200));
  const p2 = await m('payments.create', { invoiceId: invId, amount: 15000, paymentDate: '2026-07-06', paymentMethodId: pm.CASH }, admin.jar);
  check('payments', 'solde 15 000 (espèces)', !!p2.data?.id, JSON.stringify(p2.error ?? '').slice(0, 200));
  const invAfter = await q('invoices.getById', { id: invId }, admin.jar);
  check('payments', 'facture soldée → PAID, paidAmount = 25 000',
    invAfter.data?.status === 'PAID' && invAfter.data?.paidAmount === 25000,
    `status=${invAfter.data?.status} paid=${invAfter.data?.paidAmount}`);

  const draftInv = await m('invoices.create', {
    parentId, dueDate: '2026-08-05',
    lines: [{ registrationId: null, description: 'Ligne libre test', quantity: 1, unitPrice: 1000 }],
  }, admin.jar);
  const payDraft = await m('payments.create', { invoiceId: draftInv.data?.id, amount: 500, paymentDate: '2026-07-06', paymentMethodId: pm.CASH }, admin.jar);
  check('payments', 'paiement sur facture DRAFT rejeté', !!payDraft.error, `data=${JSON.stringify(payDraft.data)?.slice(0, 120)}`);

  // ————— I. Remboursement partiel —————
  const refund = await m('refunds.create', {
    paymentId: p1.data?.id, amount: 5000, refundDate: '2026-07-06',
    refundMethod: 'IMMEDIATE_REFUND', reason: 'Remboursement partiel smoke',
  }, admin.jar);
  check('refunds', 'remboursement partiel 5 000', !!refund.data?.id, JSON.stringify(refund.error ?? '').slice(0, 200));
  const invAfterRefund = await q('invoices.getById', { id: invId }, admin.jar);
  check('refunds', 'paidAmount recalculé (20 000)', invAfterRefund.data?.paidAmount === 20000,
    `paid=${invAfterRefund.data?.paidAmount} status=${invAfterRefund.data?.status}`);

  // ————— J. Avoir (FUTURE_CREDIT) + application —————
  const cn = await m('creditNotes.create', {
    creditedInvoiceId: invId, parentId, refundMethod: 'FUTURE_CREDIT',
    reason: 'Avoir de test campagne smoke',
    lines: [{ registrationId: null, description: 'Avoir partiel smoke', quantity: 1, unitPrice: 3000 }],
  }, admin.jar);
  check('creditNotes', 'création avoir 3 000 (crédit futur)', !!cn.data?.id, JSON.stringify(cn.error ?? '').slice(0, 220));
  const cnSent = await m('creditNotes.updateStatus', { id: cn.data?.id, status: 'SENT' }, admin.jar);
  check('creditNotes', 'avoir validé → SENT (crée le crédit parent)', !cnSent.error, JSON.stringify(cnSent.error ?? '').slice(0, 200));
  const credits = await q('registrations.getAvailableCredits', { parentId }, admin.jar);
  const creditTotal = (credits.data?.credits ?? []).reduce((s, c) => s + (c.amountRemaining ?? 0), 0);
  check('creditNotes', 'crédit disponible visible pour le parent', creditTotal >= 3000,
    JSON.stringify(credits.data ?? credits.error).slice(0, 200));

  // ————— K. Présences —————
  const regConfirm = await m('registrations.updateStatus', { id: regId, status: 'CONFIRMED' }, admin.jar);
  check('registrations', 'confirmation inscription (staff)', !regConfirm.error, JSON.stringify(regConfirm.error ?? '').slice(0, 160));
  const att = await m('attendances.markAttendance', { registrationId: regId, date: '2026-09-01', status: 'PRESENT' }, admin.jar);
  check('attendances', 'pointage présence jour 1', !!att.data?.id, JSON.stringify(att.error ?? '').slice(0, 200));

  // ————— L. FEC —————
  const fec = await m('fec.generateFEC', { startDate: '2026-01-01', endDate: '2026-12-31' }, admin.jar);
  const fecLines = (fec.data?.content ?? '').trim().split('\n');
  check('fec', 'export FEC généré avec écritures', fecLines.length > 2, `${fecLines.length} lignes`);
  // TD-012 : le SIREN nomme le fichier (art. A47 A-1 du LPF), il n'est pas une colonne.
  const fecNamed = await m('fec.generateFEC', { startDate: '2026-01-01', endDate: '2026-12-31', siren: '123 456 789' }, admin.jar);
  check('fec', 'nom du fichier SIRENFECAAAAMMJJ.txt',
    fecNamed.data?.filename === '123456789FEC20261231.txt', `${fecNamed.data?.filename}`);
  const fecBadSiren = await m('fec.generateFEC', { startDate: '2026-01-01', endDate: '2026-12-31', siren: '1234' }, admin.jar);
  check('fec', 'SIREN illisible refusé (pas de fichier mal nommé)',
    fecBadSiren.error?.data?.code === 'BAD_REQUEST', JSON.stringify(fecBadSiren.error ?? '').slice(0, 160));

  // ————— M. PDF —————
  const pdfOk = await fetch(`${BASE}/api/generate/child-profile/${childId}`, { headers: { Cookie: cookieHeader(admin.jar) } });
  check('pdf', 'fiche enfant PDF (200, application/pdf)',
    pdfOk.status === 200 && (pdfOk.headers.get('content-type') ?? '').includes('pdf'),
    `${pdfOk.status} ${pdfOk.headers.get('content-type')}`);
  const pdfAnon = await fetch(`${BASE}/api/generate/child-profile/${childId}`);
  check('pdf', 'fiche enfant sans auth → 401', pdfAnon.status === 401, `http ${pdfAnon.status}`);
  const pdf404 = await fetch(`${BASE}/api/generate/child-profile/00000000-0000-4000-a000-000000000000`, { headers: { Cookie: cookieHeader(admin.jar) } });
  check('pdf', 'fiche enfant id inconnu → 404 (pas 500)', pdf404.status === 404, `http ${pdf404.status}`);

  // ————— N. Scoping parent (lecture) —————
  const famInvoices = await q('invoices.list', { limit: 50, offset: 0 }, famLogin.jar);
  const foreignInv = (famInvoices.data?.invoices ?? []).filter((i) => i.parentId && i.parentId !== parentId);
  check('scoping', 'parent ne voit que ses factures', foreignInv.length === 0 && (famInvoices.data?.total ?? 0) >= 1,
    `total=${famInvoices.data?.total} étrangères=${foreignInv.length}`);
  const famAdmin = await q('users.list', { limit: 5, offset: 0 }, famLogin.jar);
  check('scoping', 'parent → procédure staff refusée', !!famAdmin.error && famAdmin.status === 403, `http ${famAdmin.status}`);

  // ————— O. Invariants comptables globaux —————
  const bal = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(sum(debit),0) d, COALESCE(sum(credit),0) c,
            count(*) FILTER (WHERE debit = 0 AND credit = 0) zeros
     FROM accounting_entries WHERE is_cancelled = false`);
  check('compta', 'grand livre équilibré (Σdébit = Σcrédit)', Number(bal[0].d) === Number(bal[0].c),
    `D=${bal[0].d} C=${bal[0].c}`);
  check('compta', 'aucune écriture 0/0', Number(bal[0].zeros) === 0, `zeros=${bal[0].zeros}`);
  const drift = await prisma.$queryRawUnsafe(
    `SELECT i.invoice_number FROM invoices i
     WHERE i.deleted_at IS NULL AND i.paid_amount <> (
       SELECT COALESCE(sum(p.amount),0) - COALESCE((SELECT sum(r.amount) FROM refunds r
         JOIN payments p2 ON r.payment_id = p2.id WHERE p2.invoice_id = i.id AND r.deleted_at IS NULL),0)
       FROM payments p WHERE p.invoice_id = i.id)`);
  check('compta', 'paid_amount cohérent avec paiements − remboursements (toutes factures)',
    drift.length === 0, drift.map((d) => d.invoice_number).join(','));

  // ————— Bilan —————
  const fails = results.filter((r) => !r.ok);
  console.log(`\n===== BILAN : ${results.length - fails.length}/${results.length} PASS =====`);
  for (const f of fails) console.log(`  FAIL [${f.section}] ${f.name} — ${f.detail}`);
  await prisma.$disconnect();
  process.exit(fails.length ? 1 : 0);
}

main().catch(async (e) => { console.error('ERREUR FATALE', e); await prisma.$disconnect(); process.exit(2); });
