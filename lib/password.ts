/**
 * Génération de mot de passe CÔTÉ NAVIGATEUR (US-PERS-01).
 *
 * L'administrateur déclenche la génération depuis le formulaire de création
 * d'un membre du personnel : le mot de passe apparaît en clair dans le champ,
 * il peut le copier, puis il est transmis au serveur avec le reste du
 * formulaire.
 *
 * ⚠ Le serveur ne revalide PAS la politique de génération : `staff.create`
 * n'applique que la contrainte de saisie manuelle (`z.string().min(8)`).
 * `isPasswordStrong` existe mais n'a aucun appelant serveur — cf. TD-019.
 *
 * Aléa : `crypto.getRandomValues` (Web Crypto API), JAMAIS `Math.random`.
 */

import {
  buildPassword,
  PASSWORD_DEFAULT_LENGTH,
  type RandomInt,
} from '@/lib/password-policy';

/**
 * Entier uniforme dans [0, maxExclusive) via Web Crypto, sans biais modulo.
 *
 * Le tirage naïf `value % max` sur-représente les petites valeurs quand
 * 2^32 n'est pas un multiple de `max`. On rejette donc la queue de
 * distribution qui dépasse le dernier multiple entier de `max`.
 */
const randomInt: RandomInt = (maxExclusive) => {
  if (maxExclusive <= 0) throw new RangeError('maxExclusive doit être positif');

  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % maxExclusive;
};

/**
 * Génère un mot de passe conforme à la politique de génération.
 *
 * @param length Longueur souhaitée (défaut 16, plancher 12).
 */
export function generatePassword(length: number = PASSWORD_DEFAULT_LENGTH): string {
  return buildPassword(randomInt, length);
}
