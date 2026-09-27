/**
 * Authentification des requêtes reçues par le back.
 *
 * 1. Secret interne (`x-internal-secret`) : le back n'est joignable que par le
 *    front (réseau Docker) et vérifie en plus que chaque requête vient de lui.
 * 2. Session : le cookie NextAuth (JWE chiffré avec AUTH_SECRET) est relayé
 *    tel quel par le front ; le back le déchiffre puis revalide la session en
 *    base (compte actif, version, rôle, association active) à CHAQUE requête.
 *
 * Voir docs/adr/0001-monorepo-nestjs.md.
 */
import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { decode } from '@auth/core/jwt';
import { loadEnv } from '@back/config/env';
import type { RequestUser } from '@back/http/tenant-request';
import { isSessionValid } from '@back/services/auth.service';
import type { UserRole } from '@back/trpc/trpc.context';

import { CLIENT_IP_HEADER, INTERNAL_SECRET_HEADER } from '@alvm/shared/internal-api';

/** Noms du cookie de session Auth.js (préfixe `__Secure-` en HTTPS). */
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];
const ROLES: readonly UserRole[] = ['PARENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN'];

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Comparaison à temps constant du secret interne. */
export function hasInternalSecret(headers: IncomingHttpHeaders): boolean {
  const received = Buffer.from(header(headers, INTERNAL_SECRET_HEADER) ?? '');
  const expected = Buffer.from(loadEnv().INTERNAL_API_SECRET);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Adresse du client telle que calculée par le front (qui connaît les relais
 * de confiance). N'est lue que si le secret interne est valide.
 */
export function clientIp(headers: IncomingHttpHeaders): string {
  if (!hasInternalSecret(headers)) return 'unknown';
  const value = header(headers, CLIENT_IP_HEADER)?.trim();
  return value && value.length <= 64 ? value : 'unknown';
}

function parseCookies(raw: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (raw ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return cookies;
}

/** Cookie éventuellement découpé par Auth.js (`nom.0`, `nom.1`, …). */
function readSessionCookie(cookies: Map<string, string>, name: string): string | undefined {
  if (cookies.has(name)) return cookies.get(name);
  const chunks: string[] = [];
  for (let index = 0; cookies.has(`${name}.${index}`); index++)
    chunks.push(cookies.get(`${name}.${index}`)!);
  return chunks.length ? chunks.join('') : undefined;
}

/**
 * Utilisateur authentifié de la requête, ou `null`. Toute anomalie (cookie
 * illisible, champ manquant, session révoquée) donne `null`.
 */
export async function resolveRequestUser(
  headers: IncomingHttpHeaders,
): Promise<RequestUser | null> {
  const cookies = parseCookies(header(headers, 'cookie'));
  for (const name of SESSION_COOKIES) {
    const token = readSessionCookie(cookies, name);
    if (!token) continue;
    const payload = await decode({ token, secret: loadEnv().AUTH_SECRET, salt: name }).catch(
      () => null,
    );
    if (
      !payload ||
      typeof payload.id !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.sessionVersion !== 'number' ||
      !ROLES.includes(payload.role as UserRole)
    )
      return null;
    const user = {
      id: payload.id,
      role: payload.role as UserRole,
      organizationId: payload.organizationId,
    };
    const valid = await isSessionValid({ ...user, sessionVersion: payload.sessionVersion });
    return valid ? user : null;
  }
  return null;
}
