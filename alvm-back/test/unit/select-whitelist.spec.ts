/**
 * Non-régression de l'audit « select obligatoire » (CLAUDE.md InnovIA §5.9,
 * §5.13 ; rapport : docs/audit-select-2026-09-27.md).
 *
 * Deux garde-fous par procédure :
 * - la requête Prisma porte une whitelist `select` (jamais `include`) qui ne
 *   demande aucun champ sensible ;
 * - la réponse ne contient aucun champ sensible, MÊME si la base renvoie une
 *   ligne complète (les mocks ci-dessous sont volontairement « empoisonnés »
 *   avec le hash du mot de passe, la version de session, le tenant…).
 */
import { describe, it, expect } from 'vitest';
import {
  createTestCaller,
  ADMIN_USER,
  STAFF_USER,
  PARENT_USER,
  SUPER_ADMIN_USER,
  TEST_ORGANIZATION_ID,
} from '../helpers/test-caller';

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Champs qui ne doivent JAMAIS sortir d'une procédure de comptes. */
const ACCOUNT_SECRETS = ['accounts', 'providerAccountId', 'sessionVersion', 'sessions'];
/** Champs internes du tenant, jamais utiles à un écran métier. */
const TENANT_INTERNALS = ['organizationId', 'disabledAt'];

/** Toutes les clés d'un objet, en profondeur (tableaux compris). */
function deepKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object' && !(value instanceof Date))
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      deepKeys(child, keys);
    }
  return keys;
}

function expectNoKeys(value: unknown, forbidden: string[]) {
  const keys = deepKeys(value);
  for (const key of forbidden) expect(keys, `champ « ${key} » exposé`).not.toContain(key);
}

/**
 * La requête a été faite avec une whitelist `select` (pas d'`include`) qui ne
 * demande aucun des champs interdits.
 */
function expectWhitelistedQuery(mockFn: { mock: { calls: unknown[][] } }, forbidden: string[]) {
  expect(mockFn.mock.calls.length).toBeGreaterThan(0);
  for (const [args] of mockFn.mock.calls as Array<[Record<string, unknown>]>) {
    expect(args.include, 'include utilisé au lieu de select').toBeUndefined();
    expect(args.select, 'select absent').toBeDefined();
    expectNoKeys(args.select, forbidden);
  }
}

const now = new Date('2026-09-27T10:00:00Z');
const USER_ID = 'c0000000-0000-4000-a000-000000000010';

/** Ligne `users` complète, telle qu'un `include` ou un modèle brut la renverrait. */
function poisonedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    organizationId: TEST_ORGANIZATION_ID,
    email: 'parent@test.nc',
    name: 'Parent Test',
    image: null,
    role: 'PARENT',
    emailVerified: now,
    createdAt: now,
    updatedAt: now,
    disabledAt: null,
    sessionVersion: 7,
    accounts: [{ provider: 'credentials', providerAccountId: '$2a$12$hash-du-mot-de-passe' }],
    parent: {
      userId: USER_ID,
      organizationId: TEST_ORGANIZATION_ID,
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '+687 12 34 56',
      homePhone: null,
      workPhone: null,
      email: 'parent@test.nc',
      address: '1 rue de la Paix',
      city: 'Nouméa',
      postalCode: '98800',
      employeur: null,
      fonction: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    staffMember: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// users.*
// ---------------------------------------------------------------------------

describe('§5.9 — users.* ne transporte ni secret ni champ interne', () => {
  const forbidden = [...ACCOUNT_SECRETS, ...TENANT_INTERNALS];

  it('users.list : whitelist select et réponse sans secret', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.user.findMany.mockResolvedValue([poisonedUser()]);
    mockPrisma.user.count.mockResolvedValue(1);

    const result = await caller.users.list({});

    expectWhitelistedQuery(mockPrisma.user.findMany, forbidden);
    expectNoKeys(result, forbidden);
    expect(result.users[0].parentProfile?.firstName).toBe('Jean');
  });

  it('users.getById : whitelist select et réponse sans secret', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.user.findUnique.mockResolvedValue(poisonedUser());

    const result = await caller.users.getById({ id: USER_ID });

    expectWhitelistedQuery(mockPrisma.user.findUnique, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('users.create : la réponse relue ne contient ni hash ni version de session', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: USER_ID });
    mockPrisma.account.create.mockResolvedValue({});
    mockPrisma.parent.create.mockResolvedValue({});
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(poisonedUser());

    const result = await caller.users.create({
      email: 'parent@test.nc',
      name: 'Parent Test',
      role: 'PARENT',
      password: 'Motdepasse1',
      parentProfile: { firstName: 'Jean', lastName: 'Dupont', phone: '+687123456' },
    });

    expectWhitelistedQuery(mockPrisma.user.findUniqueOrThrow, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('users.update : la réponse relue ne contient ni hash ni version de session', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.user.findUnique.mockResolvedValue(poisonedUser());
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(poisonedUser());

    const result = await caller.users.update({ id: USER_ID, name: 'Nouveau Nom' });

    expectWhitelistedQuery(mockPrisma.user.findUnique, ACCOUNT_SECRETS);
    expectWhitelistedQuery(mockPrisma.user.findUniqueOrThrow, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('users.resetPassword : seul le mot de passe temporaire est rendu', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.user.findUnique.mockResolvedValue(poisonedUser());
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc', providerAccountId: '$2a$old' });

    const result = await caller.users.resetPassword({ userId: USER_ID });

    expect(Object.keys(result).sort()).toEqual(['success', 'tempPassword']);
    expectWhitelistedQuery(mockPrisma.account.findFirst, ['providerAccountId']);
  });
});

// ---------------------------------------------------------------------------
// parents.*
// ---------------------------------------------------------------------------

/** Ligne `parents` complète, compte de connexion inclus (ce qu'un include brut renverrait). */
function poisonedParent(overrides: Record<string, unknown> = {}) {
  const user = poisonedUser();
  return {
    ...user.parent,
    user: { ...user, parent: undefined },
    childrenLinks: [{ id: 'link-1' }],
    ...overrides,
  };
}

describe('§5.9 — parents.* ne transporte ni secret ni champ interne', () => {
  const forbidden = [...ACCOUNT_SECRETS, ...TENANT_INTERNALS];

  it('parents.list : whitelist select et réponse sans secret', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.parent.findMany.mockResolvedValue([poisonedParent()]);
    mockPrisma.parent.count.mockResolvedValue(1);

    const result = await caller.parents.list({});

    expectWhitelistedQuery(mockPrisma.parent.findMany, forbidden);
    expectNoKeys(result, forbidden);
    expect(result.parents[0].user.email).toBe('parent@test.nc');
  });

  it('parents.getById : whitelist select et réponse sans secret', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.parent.findFirst.mockResolvedValue(poisonedParent());

    const result = await caller.parents.getById({ id: USER_ID });

    expectWhitelistedQuery(mockPrisma.parent.findFirst, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('parents.update (parent connecté) : réponse whitelistée', async () => {
    const { caller, mockPrisma } = createTestCaller(PARENT_USER);
    mockPrisma.parent.update.mockResolvedValue(poisonedParent());

    const result = await caller.parents.update({ firstName: 'Jeanne' });

    expectWhitelistedQuery(mockPrisma.parent.update, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('parents.create : réponse whitelistée', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.user.create.mockResolvedValue({ id: USER_ID });
    mockPrisma.parent.create.mockResolvedValue(poisonedParent());

    const result = await caller.parents.create({
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'parent@test.nc',
      phone: '+687123456',
    });

    expectWhitelistedQuery(mockPrisma.parent.create, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('parents.updateByStaff : réponse whitelistée', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.parent.findFirst.mockResolvedValue(poisonedParent());
    mockPrisma.user.findUnique.mockResolvedValue(poisonedUser());
    mockPrisma.parent.update.mockResolvedValue(poisonedParent());

    const result = await caller.parents.updateByStaff({ id: USER_ID, email: 'autre@test.nc' });

    expectWhitelistedQuery(mockPrisma.parent.update, forbidden);
    expectWhitelistedQuery(mockPrisma.user.findUnique, ACCOUNT_SECRETS);
    expectNoKeys(result, forbidden);
  });
});

// ---------------------------------------------------------------------------
// staff.* et staffDocuments.*
// ---------------------------------------------------------------------------

const STAFF_MEMBER_ID = 'c0000000-0000-4000-a000-000000000011';

function poisonedStaffMember(overrides: Record<string, unknown> = {}) {
  return {
    userId: STAFF_MEMBER_ID,
    organizationId: TEST_ORGANIZATION_ID,
    firstName: 'Anne',
    lastName: 'Animatrice',
    email: 'anne@test.nc',
    phone: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    user: poisonedUser({ id: STAFF_MEMBER_ID, role: 'STAFF', parent: null }),
    ...overrides,
  };
}

describe('§5.9 — staff.* ne transporte ni secret ni champ interne', () => {
  const forbidden = [...ACCOUNT_SECRETS, ...TENANT_INTERNALS];

  it('staff.list : whitelist select et réponse sans secret', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.staffMember.findMany.mockResolvedValue([poisonedStaffMember()]);
    mockPrisma.staffMember.count.mockResolvedValue(1);

    const result = await caller.staff.list({});

    expectWhitelistedQuery(mockPrisma.staffMember.findMany, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('staff.getById : whitelist select et réponse sans secret', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.staffMember.findFirst.mockResolvedValue(poisonedStaffMember());

    const result = await caller.staff.getById({ id: STAFF_MEMBER_ID });

    expectWhitelistedQuery(mockPrisma.staffMember.findFirst, forbidden);
    expectNoKeys(result, forbidden);
  });

  it('staff.create : seul le mot de passe généré sort, jamais son hash', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.user.create.mockResolvedValue({ id: STAFF_MEMBER_ID });
    mockPrisma.staffMember.create.mockResolvedValue(poisonedStaffMember());

    const result = await caller.staff.create({
      firstName: 'Anne',
      lastName: 'Animatrice',
      email: 'anne@test.nc',
    });

    expectWhitelistedQuery(mockPrisma.staffMember.create, forbidden);
    expectNoKeys(result, forbidden);
    expect(result.generatedPassword).toEqual(expect.any(String));
  });

  it('staff.update : réponse whitelistée', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    mockPrisma.staffMember.findFirst.mockResolvedValue(poisonedStaffMember());
    mockPrisma.user.findUnique.mockResolvedValue(poisonedUser({ role: 'STAFF' }));
    mockPrisma.staffMember.update.mockResolvedValue(poisonedStaffMember());

    const result = await caller.staff.update({ id: STAFF_MEMBER_ID, email: 'anne2@test.nc' });

    expectWhitelistedQuery(mockPrisma.staffMember.update, forbidden);
    expectWhitelistedQuery(mockPrisma.user.findUnique, ACCOUNT_SECRETS);
    expectNoKeys(result, forbidden);
  });

  it('staffDocuments.list : ni URL de stockage, ni déposant, ni tenant', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.staffMember.findFirst.mockResolvedValue({ userId: STAFF_MEMBER_ID });
    mockPrisma.staffDocument.findMany.mockResolvedValue([
      {
        id: 'd0000000-0000-4000-a000-000000000001',
        organizationId: TEST_ORGANIZATION_ID,
        staffId: STAFF_MEMBER_ID,
        filename: 'x.pdf',
        originalFilename: 'contrat.pdf',
        fileUrl: 'https://blob.example/tenants/secret/x.pdf',
        mimeType: 'application/pdf',
        fileSize: 10,
        description: null,
        uploadedBy: ADMIN_USER.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ]);

    const result = await caller.staffDocuments.list({ staffId: STAFF_MEMBER_ID });

    expectWhitelistedQuery(mockPrisma.staffDocument.findMany, [
      'fileUrl',
      'uploadedBy',
      'organizationId',
    ]);
    expectNoKeys(result, ['uploadedBy', 'organizationId', 'deletedAt']);
    expect(result[0].fileUrl).toBe('/api/documents/staff/d0000000-0000-4000-a000-000000000001');
  });
});

// ---------------------------------------------------------------------------
// account.me, platform.*, organizations.current
// ---------------------------------------------------------------------------

describe('§5.9 — comptes vus par leur titulaire et par la plateforme', () => {
  it('account.me : nom et email seulement, même si la base renvoie la ligne complète', async () => {
    const { caller, mockPrisma } = createTestCaller(PARENT_USER);
    mockPrisma.user.findUnique.mockResolvedValue(poisonedUser());

    const result = await caller.account.me();

    expectWhitelistedQuery(mockPrisma.user.findUnique, [...ACCOUNT_SECRETS, ...TENANT_INTERNALS]);
    expect(result).toEqual({ name: 'Parent Test', email: 'parent@test.nc' });
  });

  it('account.update : le hash est lu pour vérification mais jamais renvoyé', async () => {
    const { caller, mockPrisma } = createTestCaller(PARENT_USER);
    const { hash } = await import('bcryptjs');
    mockPrisma.account.findFirst.mockResolvedValue({
      id: 'acc',
      providerAccountId: await hash('Motdepasse1', 4),
    });

    const result = await caller.account.update({
      name: 'Parent Test',
      email: 'parent@test.nc',
      currentPassword: 'Motdepasse1',
    });

    expect(result).toEqual({ success: true });
  });

  it('platform.accounts : ni hash, ni version de session, même sur une ligne complète', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.user.findMany.mockResolvedValue([
      poisonedUser({
        organization: { id: TEST_ORGANIZATION_ID, name: 'Asso', slug: 'asso', status: 'ACTIVE' },
      }),
    ]);
    mockPrisma.user.count.mockResolvedValue(1);

    const result = await caller.platform.accounts({});

    expectWhitelistedQuery(mockPrisma.user.findMany, ACCOUNT_SECRETS);
    // (`accounts` est aussi le nom de la liste renvoyée : on inspecte ses éléments.)
    expectNoKeys(result.accounts, [
      ...ACCOUNT_SECRETS,
      'parent',
      'staffMember',
      'organizationId',
      'status',
    ]);
    // L'écran de super administration a besoin de l'état et du rattachement.
    expect(result.accounts[0]).toMatchObject({
      disabledAt: null,
      organization: { id: TEST_ORGANIZATION_ID, name: 'Asso', slug: 'asso' },
    });
  });

  it('platform.audit : libellés seulement, ni tenant ni identifiants bruts', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.platformAuditLog.findMany.mockResolvedValue([
      {
        id: 'e0000000-0000-4000-a000-000000000001',
        organizationId: TEST_ORGANIZATION_ID,
        actorId: USER_ID,
        action: 'auth.login',
        target: 'PARENT',
        outcome: 'SUCCESS',
        createdAt: now,
      },
    ]);
    mockPrisma.platformAuditLog.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([{ id: USER_ID, name: 'Parent Test', email: 'x' }]);

    const result = await caller.platform.audit({});

    expectWhitelistedQuery(mockPrisma.platformAuditLog.findMany, ['organizationId']);
    expectNoKeys(result, ['organizationId', 'actorId', 'target']);
    expect(result.events[0]).toMatchObject({ actorName: 'Parent Test', targetLabel: 'Parent' });
  });

  it('organizations.current : pas d’identifiant de tenant', async () => {
    const { caller, mockPrisma } = createTestCaller(STAFF_USER);
    mockPrisma.organization.findUnique
      .mockResolvedValueOnce({ status: 'ACTIVE' })
      .mockResolvedValueOnce({ slug: 'asso', name: 'Asso', kind: 'TENANT' });

    await caller.organizations.current();

    const [args] = mockPrisma.organization.findUnique.mock.calls[1] as [
      { select: Record<string, unknown> },
    ];
    expect(args.select).toEqual({ slug: true, name: true, kind: true });
  });
});
