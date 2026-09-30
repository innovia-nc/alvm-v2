import { z } from 'zod';

/**
 * URL saisie par un utilisateur et rendue plus tard (lien, image, email).
 *
 * `z.string().url()` accepte `javascript:`, `data:`, `vbscript:`… : un lien
 * rendu devient alors une injection. Seuls http(s) passent (CLAUDE.md InnovIA
 * §5.13).
 */
export const safeUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  }, 'URL invalide : seules les adresses http(s) sont acceptées');

/** Variante stricte : HTTPS uniquement. */
export const safeHttpsUrlSchema = safeUrlSchema.refine(
  (value) => new URL(value).protocol === 'https:',
  'URL invalide : une adresse https est requise',
);
