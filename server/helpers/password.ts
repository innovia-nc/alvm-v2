import { randomInt } from 'node:crypto';

/**
 * Génération de mot de passe aléatoire pour les comptes du personnel.
 *
 * Utilisé lors de la création d'un compte staff lorsque l'administrateur
 * ne saisit pas de mot de passe manuellement : le serveur en génère un,
 * le hash (bcrypt) et renvoie le clair UNE SEULE FOIS pour transmission.
 *
 * Garanties (par construction) :
 * - au moins une majuscule, une minuscule, un chiffre et un symbole ;
 * - satisfait la politique de `staff.create` (min 8, [A-Z][a-z][0-9]).
 *
 * Aléa cryptographique via `node:crypto.randomInt` (pas `Math.random`).
 * Jeux de caractères sans ambiguïté visuelle (pas de 0/O/1/I/l) pour
 * faciliter la lecture/recopie par l'administrateur.
 */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I, O
const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // sans l
const DIGITS = '23456789'; // sans 0, 1
const SYMBOLS = '!@#$%*?-_';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** Retourne un caractère aléatoire (CSPRNG) issu de `charset`. */
function pick(charset: string): string {
  return charset[randomInt(charset.length)];
}

/** Mélange Fisher-Yates en place avec aléa cryptographique. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Génère un mot de passe robuste.
 *
 * @param length Longueur totale (défaut 16, minimum effectif 8).
 */
export function generatePassword(length = 16): string {
  const size = Math.max(8, length);

  // Garantir une occurrence de chaque classe requise.
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];

  const rest: string[] = [];
  for (let i = required.length; i < size; i++) {
    rest.push(pick(ALL));
  }

  return shuffle([...required, ...rest]).join('');
}
