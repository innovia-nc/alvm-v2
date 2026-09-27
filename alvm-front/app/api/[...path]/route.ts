/**
 * Relais `/api/{trpc,documents,generate,upload}/*` → back NestJS.
 *
 * Le navigateur ne connaît qu'une origine (le front) : le cookie de session
 * httpOnly voyage tel quel, le back le déchiffre et revalide la session. Les
 * en-têtes internes reçus du client sont écrasés (ni secret ni IP forgeables).
 * `/api/auth/*` (NextAuth) est une route plus spécifique : elle n'arrive pas ici.
 */
import {
  BACK_API_PREFIXES,
  CLIENT_IP_HEADER,
  INTERNAL_SECRET_HEADER,
} from '@alvm/shared/internal-api';
import { backUrl, internalHeaders } from '@/lib/api/back';

export const dynamic = 'force-dynamic';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'host',
  INTERNAL_SECRET_HEADER,
  CLIENT_IP_HEADER,
]);
const PREFIXES = new Set<string>(BACK_API_PREFIXES);

/**
 * Taille maximale d'un corps relayé : le plus gros envoi légitime est un
 * document PDF de 5 Mo en multipart. Le back lit les corps en entier
 * (`formData()`, JSON tRPC) : sans borne, un envoi massif occuperait sa mémoire.
 */
const MAX_RELAYED_BODY = 6 * 1024 * 1024;

/**
 * Lit le corps en refusant tout dépassement, que la taille soit annoncée
 * (`content-length`) ou non (envoi fragmenté).
 */
async function readBoundedBody(request: Request): Promise<ArrayBuffer | 'too-large'> {
  const announced = Number(request.headers.get('content-length') ?? '0');
  if (announced > MAX_RELAYED_BODY) return 'too-large';
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RELAYED_BODY) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function relay(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!PREFIXES.has(path[0] ?? '')) return Response.json({ error: 'Introuvable' }, { status: 404 });

  const source = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
  });
  for (const [name, value] of Object.entries(internalHeaders(request.headers)))
    headers.set(name, value);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await readBoundedBody(request) : undefined;
  if (body === 'too-large')
    return Response.json({ error: 'Requête trop volumineuse' }, { status: 413 });
  headers.delete('content-length');
  let response: Response;
  try {
    response = await fetch(backUrl(source.pathname + source.search), {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: request.signal,
    });
  } catch {
    return Response.json({ error: 'Service momentanément indisponible' }, { status: 503 });
  }

  const out = new Headers();
  response.headers.forEach((value, name) => {
    const key = name.toLowerCase();
    // fetch a déjà décompressé le corps : longueur et encodage ne sont plus valables.
    if (!HOP_BY_HOP.has(key) && key !== 'content-encoding' && key !== 'content-length')
      out.set(name, value);
  });
  return new Response(response.body, { status: response.status, headers: out });
}

export { relay as GET, relay as POST, relay as PUT, relay as PATCH, relay as DELETE };
