import { handleHealth } from '@/server/http/health.handler';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleHealth(request);
}
