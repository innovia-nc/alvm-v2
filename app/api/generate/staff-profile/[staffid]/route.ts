import { requestUser } from '@/lib/auth';
import { handleStaffProfilePdf } from '@/server/http/generated-pdf.handler';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ staffid: string }> }) {
  return handleStaffProfilePdf((await params).staffid, await requestUser());
}
