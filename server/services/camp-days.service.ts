import type { ExtendedPrismaClient } from '@/server/db';
type Tx = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
export async function syncCampDays(tx: Tx, camp: { id: string; startDate: Date; endDate: Date }) {
  const dates: Date[] = [];
  for (let time = camp.startDate.getTime(); time <= camp.endDate.getTime(); time += 86_400_000)
    dates.push(new Date(time));
  await tx.campDay.createMany({
    data: dates.map((date) => ({ campId: camp.id, date })),
    skipDuplicates: true,
  });
  await tx.campDay.deleteMany({ where: { campId: camp.id, date: { notIn: dates } } });
  const days = await tx.campDay.findMany({
    where: { campId: camp.id },
    orderBy: { date: 'asc' },
    select: { id: true },
  });
  await tx.registration.updateMany({
    where: { campId: camp.id, deletedAt: null },
    data: { selectedDays: days.map((d) => d.id) },
  });
}
