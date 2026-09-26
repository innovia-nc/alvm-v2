import { router, protectedProcedure } from '@/server/trpc/init';
import { toNum } from '@/server/helpers/decimal';
import { overdueWhere } from '@/server/helpers/invoice-status';
export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const own = ctx.user.role === 'PARENT' ? { parentId: ctx.user.id } : {};
    const [pending, cancellationRequests, due, overdue, upcoming] = await Promise.all([
      ctx.prisma.registration.count({ where: { ...own, deletedAt: null, status: 'PENDING' } }),
      ctx.prisma.registration.findMany({
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
      }),
      ctx.prisma.invoice.aggregate({
        where: {
          ...own,
          deletedAt: null,
          invoiceType: 'INVOICE',
          status: { in: ['SENT', 'OVERDUE'] },
        },
        _sum: { totalAmount: true, paidAmount: true, creditedAmount: true },
      }),
      ctx.prisma.invoice.count({
        where: { ...own, deletedAt: null, invoiceType: 'INVOICE', ...overdueWhere() },
      }),
      ctx.prisma.camp.findMany({
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
      }),
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
