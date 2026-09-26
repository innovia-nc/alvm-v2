import { requestUser } from '@/lib/auth';
import { handleChildProfilePdf } from '@/server/http/generated-pdf.handler';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ childId: string }> }) {
  return handleChildProfilePdf((await params).childId, await requestUser());
}
