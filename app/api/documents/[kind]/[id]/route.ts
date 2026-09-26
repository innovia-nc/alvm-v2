import { requestUser } from '@/lib/auth';
import { handleDocumentDownload } from '@/server/http/documents.handler';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  return handleDocumentDownload(await params, await requestUser());
}
