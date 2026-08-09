import { randomInt } from 'node:crypto';
import { buildPassword, PASSWORD_DEFAULT_LENGTH } from '@/lib/password-policy';

/**
 * Génération de mot de passe côté SERVEUR.
 *
 * Deux usages :
 * - `users.resetPassword` : le serveur produit un mot de passe temporaire ;
 * - `staff.create` : filet de sécurité si aucun mot de passe n'est transmis
 *   (le cas nominal depuis US-PERS-01 est une génération côté navigateur —
 *   voir `lib/password.ts`).
 *
 * La politique elle-même (longueur, classes de caractères, exclusion des
 * caractères ambigus) vit dans `lib/password-policy.ts`, partagé avec le
 * client pour qu'il n'existe qu'une seule définition.
 *
 * Aléa cryptographique via `node:crypto.randomInt` (jamais `Math.random`).
 */

/**
 * Coût bcrypt (work factor) pour le hachage des mots de passe.
 * Centralisé ici pour rester cohérent sur tous les flux (création staff,
 * users, parents, reset, changement de mot de passe).
 */
export const BCRYPT_ROUNDS = 12;

/**
 * Génère un mot de passe robuste.
 *
 * @param length Longueur totale (défaut 16, plancher 12).
 */
export function generatePassword(length: number = PASSWORD_DEFAULT_LENGTH): string {
  return buildPassword((maxExclusive) => randomInt(maxExclusive), length);
}
