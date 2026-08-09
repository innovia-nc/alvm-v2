/**
 * Politique de mot de passe — module ISOMORPHE (client + serveur).
 *
 * Ce fichier ne doit importer NI `node:crypto` NI aucune API navigateur : il
 * décrit uniquement la politique et compose un mot de passe à partir d'une
 * source d'aléa injectée. Les deux appelants fournissent leur propre CSPRNG :
 *   - navigateur : `lib/password.ts`          (crypto.getRandomValues)
 *   - serveur    : `server/helpers/password.ts` (node:crypto.randomInt)
 *
 * Politique de GÉNÉRATION (US-PERS-01) :
 *   - 12 caractères minimum ;
 *   - au moins une majuscule, une minuscule, un chiffre et un caractère
 *     spécial (garanti par construction, pas par tirage au sort) ;
 *   - aucun caractère visuellement ambigu (0/O, 1/l/I) : les mots de passe
 *     sont souvent communiqués oralement ou recopiés à la main.
 *
 * La politique de SAISIE MANUELLE reste distincte et plus permissive
 * (8 caractères, cf. `staff.create`) : elle n'est pas modifiée ici.
 */

/** Longueur minimale d'un mot de passe généré. */
export const PASSWORD_MIN_LENGTH = 12;

/** Longueur par défaut d'un mot de passe généré. */
export const PASSWORD_DEFAULT_LENGTH = 16;

export const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I, O
export const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // sans l
export const DIGITS = '23456789'; // sans 0, 1
export const SYMBOLS = '!@#$%*?-_';
export const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/**
 * Source d'aléa : doit retourner un entier uniformément réparti dans
 * `[0, maxExclusive)`. L'appelant est responsable d'en fournir une
 * implémentation cryptographiquement sûre (jamais `Math.random`).
 */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Compose un mot de passe conforme à la politique de génération.
 *
 * @param randomInt Source d'aléa CSPRNG fournie par l'appelant.
 * @param length    Longueur souhaitée (ramenée à `PASSWORD_MIN_LENGTH` si en dessous).
 */
export function buildPassword(
  randomInt: RandomInt,
  length: number = PASSWORD_DEFAULT_LENGTH
): string {
  const size = Math.max(PASSWORD_MIN_LENGTH, length);
  const pick = (charset: string) => charset[randomInt(charset.length)];

  // Une occurrence de chaque classe requise, garantie par construction.
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));

  // Mélange Fisher-Yates : sinon les 4 premières positions trahiraient les classes.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * Vérifie qu'un mot de passe respecte la politique de génération.
 * Utilisé côté serveur pour valider la robustesse d'un mot de passe généré
 * par le navigateur (le client n'est jamais une source de confiance).
 */
export function isPasswordStrong(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    new RegExp(`[${SYMBOLS.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')}]`).test(password)
  );
}
