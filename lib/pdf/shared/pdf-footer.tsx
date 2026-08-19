/**
 * Composant footer partagé pour tous les PDFs ALVM.
 *
 * Garantit l'uniformité des mentions légales et coordonnées
 * affichées en bas de chaque document généré.
 *
 * Aucune dépendance Prisma : reçoit toutes ses données en props.
 * Les data viennent de `getPdfSettings()` (server/helpers/pdf-settings.helper.ts).
 */

import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';

// ============================================================================
// TYPES
// ============================================================================

export interface OrgInfo {
  name: string;
  shortName?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  ridet?: string;
  ape?: string;
  legalForm?: string; // ex: "Association loi 1901", "SAS", "SARL"
}

/**
 * Place à réserver en bas de page (`paddingBottom` du style `page`) pour tout
 * document qui rend un `PDFFooter`.
 *
 * Le footer est en `position: absolute` (`bottom: 16`) : il est donc hors du
 * flux, et le contenu qui coule en bas de page passe DESSOUS si la page ne lui
 * réserve pas la place. Avec ses 3 lignes de coordonnées, la mention légale et
 * la ligne méta, il occupe ~70pt — davantage dès qu'une ligne se replie.
 * 90pt couvrent ce cas avec une marge de sécurité.
 *
 * Deux incidents de recette ont eu cette même cause racine : US-UX-03 (bloc
 * signature de la fiche enfant recouvert) et US-FACT-01-bis (tableau des modes
 * de règlement recouvert au-delà de 4 règlements). Voir TD-004.
 */
export const PDF_FOOTER_RESERVED_SPACE = 90;

// La pagination « X / Y » n'est plus optionnelle : les cinq documents la
// laissaient à sa valeur par défaut (`true`), et la branche « sans
// pagination » — une cellule vide poussée dans la ligne méta — n'a jamais été
// rendue. Prop `showPagination` retirée à la sixième passe de code mort ; un
// document qui devrait s'en passer se traiterait par une variante explicite,
// pas par un booléen que personne ne positionne.
interface PDFFooterProps {
  org: OrgInfo;
  /** Mention spécifique au document (depuis settings/documents) */
  mention?: string;
  /** Affiche "Imprimé le ..." */
  generatedAt?: Date;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    left: 30,
    right: 30,
    paddingTop: 8,
    borderTop: '0.5pt solid #ccc',
  },
  line: {
    fontSize: 8,
    color: '#555',
    textAlign: 'center',
    marginBottom: 2,
  },
  mention: {
    fontSize: 8,
    color: '#777',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    fontSize: 7,
    color: '#888',
  },
  meta: {
    fontSize: 7,
    color: '#888',
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function formatDateFr(d: Date): string {
  return new Date(d).toLocaleDateString('fr-FR');
}

function joinNonEmpty(parts: Array<string | undefined>, separator: string): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(separator);
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PDFFooter: React.FC<PDFFooterProps> = ({ org, mention, generatedAt }) => {
  // Ligne 1 : identité légale
  const identityParts: Array<string | undefined> = [
    org.name,
    org.legalForm,
    org.ridet ? `RIDET: ${org.ridet}` : undefined,
  ];
  const line1 = joinNonEmpty(identityParts, ' — ');

  // Ligne 2 : adresse complète
  const cityBlock = joinNonEmpty([org.postalCode, org.city], ' ');
  const line2 = joinNonEmpty([org.address, cityBlock, org.country], ', ');

  // Ligne 3 : contacts + APE
  const contactParts: Array<string | undefined> = [
    org.phone ? `Tél: ${org.phone}` : undefined,
    org.email ? `Email: ${org.email}` : undefined,
    org.ape ? `APE: ${org.ape}` : undefined,
  ];
  const line3 = joinNonEmpty(contactParts, ' — ');

  const hasGeneratedAt = Boolean(generatedAt);

  return (
    <View style={styles.container} fixed>
      {line1 && <Text style={styles.line}>{line1}</Text>}
      {line2 && <Text style={styles.line}>{line2}</Text>}
      {line3 && <Text style={styles.line}>{line3}</Text>}
      {mention && mention.trim() && <Text style={styles.mention}>{mention}</Text>}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {hasGeneratedAt ? `Imprimé le ${formatDateFr(generatedAt as Date)}` : ' '}
        </Text>
        <Text
          style={styles.meta}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </View>
  );
};
