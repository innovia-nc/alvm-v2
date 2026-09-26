import { requestUser } from '@/lib/auth';
import { handleAttendanceListPdf } from '@/server/http/generated-pdf.handler';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ campId: string }> }) {
  return handleAttendanceListPdf((await params).campId, await requestUser());
}
