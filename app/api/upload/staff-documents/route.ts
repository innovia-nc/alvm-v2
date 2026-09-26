import { requestUser } from '@/lib/auth';
import { handleStaffDocumentUpload } from '@/server/http/uploads.handler';

export async function POST(request: Request) {
  return handleStaffDocumentUpload(request, await requestUser());
}
