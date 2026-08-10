/**
 * Politique de mot de passe (US-PERS-01).
 *
 * Deux générateurs existent — navigateur (`lib/password.ts`, Web Crypto) et
 * serveur (`server/helpers/password.ts`, node:crypto) — mais une seule
 * politique (`lib/password-policy.ts`). Les deux sont donc soumis à la même
 * batterie d'assertions, avec `isPasswordStrong` comme oracle unique.
 */

import { describe, it, expect } from 'vitest';
import { generatePassword as generateServerSide } from '@/server/helpers/password';
import { generatePassword as generateClientSide } from '@/lib/password';
import { isPasswordStrong, PASSWORD_MIN_LENGTH } from '@/lib/password-policy';

// `lib/password.ts` s'appuie sur crypto.getRandomValues, exposé par le module
// `node:crypto` global de Node 22 — disponible tel quel en environnement node.
const GENERATORS: Array<[string, (length?: number) => string]> = [
  ['serveur (node:crypto)', generateServerSide],
  ['navigateur (Web Crypto)', generateClientSide],
];

describe.each(GENERATORS)('generatePassword — %s', (_label, generatePassword) => {
  it(`respecte la politique (min ${PASSWORD_MIN_LENGTH}, maj, min, chiffre, symbole)`, () => {
    for (let i = 0; i < 200; i++) {
      const pwd = generatePassword();
      expect(pwd.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[!@#$%*?\-_]/);
      expect(isPasswordStrong(pwd)).toBe(true);
    }
  });

  it('respecte la longueur demandée', () => {
    expect(generatePassword(24)).toHaveLength(24);
    expect(generatePassword(32)).toHaveLength(32);
  });

  it(`applique un plancher de ${PASSWORD_MIN_LENGTH} caractères`, () => {
    expect(generatePassword(4).length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
  });

  it('produit des valeurs distinctes (aléa)', () => {
    const set = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(set.size).toBe(50);
  });

  it("n'utilise pas de caractères ambigus (0 O 1 I l)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePassword()).not.toMatch(/[0O1Il]/);
    }
  });
});

describe('isPasswordStrong', () => {
  it('rejette un mot de passe trop court même complet', () => {
    expect(isPasswordStrong('Ab3!Ab3!')).toBe(false);
  });

  it('rejette un mot de passe sans caractère spécial', () => {
    expect(isPasswordStrong('Abcdefgh23456')).toBe(false);
  });

  it('rejette un mot de passe sans chiffre', () => {
    expect(isPasswordStrong('Abcdefghijk!')).toBe(false);
  });

  it('accepte un mot de passe conforme', () => {
    expect(isPasswordStrong('Abcdefgh234!')).toBe(true);
  });
});
