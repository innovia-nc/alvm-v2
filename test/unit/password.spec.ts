import { describe, it, expect } from 'vitest';
import { generatePassword } from '@/server/helpers/password';

describe('generatePassword', () => {
  it('respecte la politique (min 8, maj, min, chiffre)', () => {
    for (let i = 0; i < 200; i++) {
      const pwd = generatePassword();
      expect(pwd.length).toBeGreaterThanOrEqual(8);
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
    }
  });

  it('contient au moins un symbole', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).toMatch(/[!@#$%*?\-_]/);
    }
  });

  it('respecte la longueur demandée', () => {
    expect(generatePassword(24)).toHaveLength(24);
    expect(generatePassword(32)).toHaveLength(32);
  });

  it('applique un plancher de 8 caractères', () => {
    expect(generatePassword(4).length).toBeGreaterThanOrEqual(8);
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
