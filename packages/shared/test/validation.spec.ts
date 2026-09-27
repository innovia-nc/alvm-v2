import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/validation/escape-html';
import { safeHttpsUrlSchema, safeUrlSchema } from '../src/validation/safe-url';
import { ORGANIZATION_SLUG_PATTERN } from '../src/organization-slug';

describe('safeUrlSchema', () => {
  it.each(['https://asso.nc/logo.png', 'http://localhost:3000/a?b=c'])('accepte %s', (url) => {
    expect(safeUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'ftp://asso.nc/fichier',
    '//asso.nc/sans-protocole',
    'pas une url',
  ])('refuse %s', (url) => {
    expect(safeUrlSchema.safeParse(url).success).toBe(false);
  });

  it('la variante stricte exige https', () => {
    expect(safeHttpsUrlSchema.safeParse('http://asso.nc').success).toBe(false);
    expect(safeHttpsUrlSchema.safeParse('https://asso.nc').success).toBe(true);
  });
});

describe('escapeHtml', () => {
  it('neutralise le balisage et les attributs', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });
});

describe('identifiant d’espace', () => {
  it.each(['alvm', 'asso-demo', 'a1-b2'])('accepte %s', (slug) => {
    expect(ORGANIZATION_SLUG_PATTERN.test(slug)).toBe(true);
  });
  it.each(['ab', '-alvm', 'alvm-', 'Alvm', 'asso demo', 'a'.repeat(41)])('refuse %s', (slug) => {
    expect(ORGANIZATION_SLUG_PATTERN.test(slug)).toBe(false);
  });
});
