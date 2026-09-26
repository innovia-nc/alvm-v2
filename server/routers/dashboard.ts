import { getFeatures } from '@/server/helpers/features';
import { defaultFeatures } from '@/lib/features/catalog';
import { router, protectedProcedure } from '@/server/trpc/init';
import { toNum } from '@/server/helpers/decimal';
import { overdueWhere } from '@/server/helpers/invoice-status';
export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const features =
      ctx.user.role === 'SUPER_ADMIN' ? defaultFeatures : await getFeatures(ctx.prisma);
    const own = ctx.user.role === 'PARENT' ? { parentId: ctx.user.id } : {};
    const [pending, cancellationRequests, due, overdue, upcoming] = await Promise.all([
      features.registrations
        ? ctx.prisma.registration.count({ where: { ...own, deletedAt: null, status: 'PENDING' } })
        : Promise.resolve(0),
      features.registrations
        ? ctx.prisma.registration.findMany({
            where: {
              ...own,
              deletedAt: null,
              cancellationRequestedAt: { not: null },
              status: { not: 'CANCELLED' },
            },
            take: 10,
            orderBy: { cancellationRequestedAt: 'asc' },
            select: {
              id: true,
              child: { select: { firstName: true, lastName: true } },
              camp: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      features.invoices
        ? ctx.prisma.invoice.aggregate({
            where: {
              ...own,
              deletedAt: null,
              invoiceType: 'INVOICE',
              status: { in: ['SENT', 'OVERDUE'] },
            },
            _sum: { totalAmount: true, paidAmount: true, creditedAmount: true },
          })
        : Promise.resolve({ _sum: { totalAmount: 0, paidAmount: 0, creditedAmount: 0 } }),
      features.invoices
        ? ctx.prisma.invoice.count({
            where: { ...own, deletedAt: null, invoiceType: 'INVOICE', ...overdueWhere() },
          })
        : Promise.resolve(0),
      features.camps
        ? ctx.prisma.camp.findMany({
            where: {
              deletedAt: null,
              status: 'PUBLISHED',
              endDate: { gte: new Date() },
              ...(ctx.user.role === 'PARENT'
                ? {
                    registrations: {
                      some: {
                        parentId: ctx.user.id,
                        deletedAt: null,
                        status: { in: ['PENDING', 'CONFIRMED'] },
                      },
                    },
                  }
                : {}),
            },
            orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
            take: 5,
            select: { id: true, name: true, startDate: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      pending,
      cancellationRequests,
      amountDue:
        toNum(due._sum.totalAmount) - toNum(due._sum.paidAmount) - toNum(due._sum.creditedAmount),
      overdue,
      upcoming,
    };
  }),
});
