/**
 * Outils d'introspection d'un arbre d'éléments React.
 *
 * Les composants `@react-pdf/renderer` ne produisent pas de DOM : on ne peut
 * donc pas les tester avec Testing Library. On appelle le composant comme une
 * fonction pure et on inspecte l'arbre d'éléments retourné — c'est suffisant
 * pour verrouiller l'ordre des blocs, les props transmises et les textes rendus.
 */

import React from 'react';

/** Aplatit un arbre d'éléments React en une liste ordonnée (parcours préfixe). */
export function flattenTree(
  node: React.ReactNode,
  out: React.ReactElement[] = []
): React.ReactElement[] {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return;
    out.push(child);
    flattenTree((child.props as { children?: React.ReactNode }).children, out);
  });
  return out;
}

/** Concatène récursivement tous les textes contenus dans un nœud. */
export function textOf(node: React.ReactNode): string {
  let acc = '';
  React.Children.forEach(node, (child) => {
    if (typeof child === 'string' || typeof child === 'number') acc += String(child);
    else if (React.isValidElement(child)) {
      acc += textOf((child.props as { children?: React.ReactNode }).children);
    }
  });
  return acc;
}

/** Texte rendu par un élément (ses enfants concaténés). */
export function elementText(element: React.ReactElement): string {
  return textOf((element.props as { children?: React.ReactNode }).children);
}

/** Tous les textes de l'arbre, dans l'ordre de rendu. */
export function allTexts(tree: React.ReactElement[]): string[] {
  return tree.map(elementText);
}
