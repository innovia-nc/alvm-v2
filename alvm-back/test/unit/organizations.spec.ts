import { describe, expect, it } from 'vitest';
import { ADMIN_USER, SUPER_ADMIN_USER, createTestCaller } from '../helpers/test-caller';

/**
 * Suspension d'une association (super administration).
 *
 * Défaut trouvé par la recette E2E SaaS 3.0.0 (SAAS-05) : la suspension ne
 * faisait que BLOQUER les sessions (contrôle du statut à chaque requête) ; un
 * jeton émis avant la suspension redevenait valable dès la réactivation, sans
 * nouvelle authentification. La suspension doit les RÉVOQUER.
 */
const TARGET = 'c0000000-0000-4000-a000-000000000001';

function organization(status: 'ACTIVE' | 'SUSPENDED') {
  return {
    id: TARGET,
    slug: 'recette',
    name: 'Recette',
    status,
    suspendedAt: status === 'SUSPENDED' ? new Date('2026-09-27T00:00:00Z') : null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  };
}

describe('organizations.setStatus', () => {
  it('révoque toutes les sessions de l’association à la suspension', async () => {
    const { caller, mockPrisma, dbContexts } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.organization.findUnique.mockResolvedValue({
      ...organization('ACTIVE'),
      kind: 'TENANT',
    });
    mockPrisma.organization.update.mockResolvedValue(organization('SUSPENDED'));
    mockPrisma.user.updateMany.mockResolvedValue({ count: 3 });

    const result = await caller.organizations.setStatus({ id: TARGET, status: 'SUSPENDED' });

    expect(result.status).toBe('SUSPENDED');
    expect(dbContexts).toEqual([{ scope: 'platform' }]);
    // Tous les comptes de l'association, et seulement eux.
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { organizationId: TARGET },
      data: { sessionVersion: { increment: 1 } },
    });
    expect(mockPrisma.platformAuditLog.createMany).toHaveBeenCalled();
  });

  it('ne rétablit aucune session à la réactivation (reconnexion obligatoire)', async () => {
    const { caller, mockPrisma } = createTestCaller(SUPER_ADMIN_USER);
    mockPrisma.organization.findUnique.mockResolvedValue({
      ...organization('SUSPENDED'),
      kind: 'TENANT',
    });
    mockPrisma.organization.update.mockResolvedValue(organization('ACTIVE'));

    await caller.organizations.setStatus({ id: TARGET, status: 'ACTIVE' });

    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE', suspendedAt: null } }),
    );
    // Les versions de session restent celles posées à la suspension.
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('est réservé au super admin', async () => {
    const { caller, mockPrisma } = createTestCaller(ADMIN_USER);
    await expect(
      caller.organizations.setStatus({ id: TARGET, status: 'SUSPENDED' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
});
