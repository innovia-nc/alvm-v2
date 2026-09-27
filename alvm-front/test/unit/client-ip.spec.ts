import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/client-ip';

const h = (xff?: string, vercel?: string) => {
  const headers = new Headers();
  if (xff) headers.set('x-forwarded-for', xff);
  if (vercel) headers.set('x-vercel-forwarded-for', vercel);
  return headers;
};

describe('getClientIp', () => {
  it('uses the Vercel header on Vercel', () => {
    expect(getClientIp(h('6.6.6.6', '1.2.3.4'), { VERCEL: '1' })).toBe('1.2.3.4');
  });

  it('ignores X-Forwarded-For without trusted proxies', () => {
    expect(getClientIp(h('1.2.3.4'), {})).toBe('local');
    expect(getClientIp(h('1.2.3.4'), { TRUSTED_PROXY_HOPS: '0' })).toBe('local');
  });

  it('reads from the end of the chain behind Traefik', () => {
    expect(getClientIp(h('6.6.6.6, 1.2.3.4'), { TRUSTED_PROXY_HOPS: '1' })).toBe('1.2.3.4');
  });

  it('skips the Cloudflare edge behind Cloudflare + Traefik', () => {
    expect(getClientIp(h('6.6.6.6, 1.2.3.4, 172.64.0.1'), { TRUSTED_PROXY_HOPS: '2' })).toBe(
      '1.2.3.4',
    );
  });

  it('does not trust a chain shorter than the declared hops', () => {
    expect(getClientIp(h('1.2.3.4'), { TRUSTED_PROXY_HOPS: '2' })).toBe('unknown');
    expect(getClientIp(h(), { TRUSTED_PROXY_HOPS: '1' })).toBe('unknown');
  });
});
