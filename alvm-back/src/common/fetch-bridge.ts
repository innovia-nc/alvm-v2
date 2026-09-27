/**
 * Passerelle Express ↔ API Fetch.
 *
 * Les handlers métier (`src/http/`) et tRPC (`fetchRequestHandler`) parlent
 * `Request`/`Response` ; NestJS (adaptateur Express) parle `req`/`res`. Le
 * corps n'est jamais pré-lu (bodyParser désactivé dans `main.ts`) : il est
 * transmis en flux, ce qui laisse `request.formData()` gérer les téléversements.
 */
import { Readable } from 'node:stream';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

export function toFetchRequest(req: ExpressRequest): Request {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host') ?? 'localhost'}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

export async function sendFetchResponse(res: ExpressResponse, response: Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (!response.body) {
    res.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    body.on('error', reject);
    res.on('finish', resolve);
    res.on('close', resolve);
    body.pipe(res);
  });
}

/** Lit un corps JSON borné (routes internes ; le bodyParser global est désactivé). */
export async function readJsonBody(req: ExpressRequest, limit = 16 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new Error('Corps de requête trop volumineux');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}
