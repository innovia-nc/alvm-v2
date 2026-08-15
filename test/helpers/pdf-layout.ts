/**
 * Introspection de la mise en page d'un PDF réellement rendu.
 *
 * `test/helpers/react-tree.ts` inspecte l'arbre React *avant* rendu : il dit ce
 * qu'on a demandé, pas où ça atterrit. Or les défauts de type « le contenu passe
 * sous le pied de page » (US-UX-03, US-FACT-01-bis, TD-004) ne sont visibles
 * qu'après le calcul de mise en page de @react-pdf.
 *
 * On rend donc le document en buffer, on décompresse les flux de contenu et on
 * rejoue les transformations PDF pour obtenir la position réelle de chaque bloc
 * de texte, dans le repère PDF (origine en bas à gauche, y croissant vers le
 * haut).
 */

import zlib from 'node:zlib';

export interface TextBlock {
  /** Ordonnée de la ligne de base, repère PDF (0 = bas de page). */
  y: number;
  /** Texte du bloc, décodé depuis les codes glyphes. */
  text: string;
}

interface PdfPage {
  /** Numéro de page, dans l'ordre des flux de contenu. */
  index: number;
  blocks: TextBlock[];
}

/** Matrice affine PDF `[a b c d e f]`. */
type Matrix = [number, number, number, number, number, number];

/** Produit `next × current` (convention vecteur-ligne des opérateurs `cm`). */
function concat(current: Matrix, next: Matrix): Matrix {
  return [
    current[0] * next[0] + current[2] * next[1],
    current[1] * next[0] + current[3] * next[1],
    current[0] * next[2] + current[2] * next[3],
    current[1] * next[2] + current[3] * next[3],
    current[0] * next[4] + current[2] * next[5] + current[4],
    current[1] * next[4] + current[3] * next[5] + current[5],
  ];
}

/** Décompresse les flux de contenu (ceux qui portent du texte). */
function contentStreams(pdf: Buffer): string[] {
  const streams: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = pdf.indexOf('stream', cursor);
    if (start === -1) break;
    let from = start + 'stream'.length;
    if (pdf[from] === 0x0d) from++;
    if (pdf[from] === 0x0a) from++;
    const end = pdf.indexOf('endstream', from);
    if (end === -1) break;
    try {
      const content = zlib.inflateSync(pdf.subarray(from, end)).toString('latin1');
      if (content.includes('BT')) streams.push(content);
    } catch {
      // Flux non compressé (police, image…) : sans intérêt ici.
    }
    cursor = end + 'endstream'.length;
  }
  return streams;
}

/** Décode les codes glyphes `<48656c6c6f>` d'un bloc de texte. */
function decodeGlyphs(block: string): string {
  return [...block.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map(([, hex]) =>
      (hex.match(/../g) ?? []).map((code) => String.fromCharCode(parseInt(code, 16))).join(''),
    )
    .join('');
}

function blocksOf(content: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const operands: number[] = [];

  // Le découpage isole les blocs BT..ET : hors d'eux on ne suit que la CTM.
  for (const part of content.split(/(BT[\s\S]*?ET)/)) {
    if (part.startsWith('BT')) {
      const tm = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/.exec(part);
      if (tm) {
        const [tx, ty] = [parseFloat(tm[1]), parseFloat(tm[2])];
        // Origine du texte transformée par Tm puis par la CTM courante.
        blocks.push({ y: ctm[1] * tx + ctm[3] * ty + ctm[5], text: decodeGlyphs(part) });
      }
      continue;
    }
    for (const token of part.split(/\s+/)) {
      if (/^-?[\d.]+$/.test(token)) {
        operands.push(parseFloat(token));
        continue;
      }
      if (token === 'q') stack.push([...ctm] as Matrix);
      else if (token === 'Q') ctm = stack.pop() ?? ctm;
      else if (token === 'cm' && operands.length >= 6) {
        ctm = concat(ctm, operands.slice(-6) as Matrix);
      }
      operands.length = 0;
    }
  }
  return blocks;
}

/** Positions réelles de tous les blocs de texte, page par page. */
export function readPdfLayout(pdf: Buffer): PdfPage[] {
  return contentStreams(pdf).map((content, index) => ({
    index: index + 1,
    blocks: blocksOf(content).filter((b) => b.text.trim().length > 0),
  }));
}
