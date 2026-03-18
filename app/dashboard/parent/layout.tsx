import { requireRole } from '@/lib/auth';

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['PARENT']);
  return <>{children}</>;
}
