import { requestUser } from '@/lib/auth';
import { handleChildDocumentUpload } from '@/server/http/uploads.handler';

export async function POST(request: Request) {
  return handleChildDocumentUpload(request, await requestUser());
}
