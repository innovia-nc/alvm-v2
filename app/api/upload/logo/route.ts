import { requestUser } from '@/lib/auth';
import { handleLogoDelete, handleLogoUpload } from '@/server/http/uploads.handler';

export async function POST(request: Request) {
  return handleLogoUpload(request, await requestUser());
}

export async function DELETE(request: Request) {
  return handleLogoDelete(request, await requestUser());
}
