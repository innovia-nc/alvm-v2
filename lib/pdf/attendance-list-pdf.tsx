/**
 * Service de génération PDF pour la liste de présence d'un ACM
 *
 * Génère un tableau matriciel : enfants en lignes, dates en colonnes.
 * Cellules : "X" (présent/retard), "O" (absent), "E" (excusé), vide (non saisi).
 * Format A4 paysage si > 6 jours, sinon portrait.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { PDFFooter, PDF_FOOTER_RESERVED_SPACE, type OrgInfo } from './shared/pdf-footer';

// ============================================================================
// TYPES
// ============================================================================

export type AttendanceCell = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | null;

export interface AttendanceListData {
  camp: {
    name: string;
    location: string;
    startDate: Date | null;
    endDate: Date | null;
  };
  dates: Date[];
  rows: Array<{
    childFirstName: string;
    childLastName: string;
    attendances: AttendanceCell[]; // aligné sur l'ordre de dates
  }>;
  org: OrgInfo;
  generatedAt: Date;
  footerMention?: string;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  page: {
    padding: 30,
    // TD-004 : le pied de page est hors du flux, il faut lui réserver sa place
    // sous peine de voir les dernières lignes du tableau le recouvrir — le cas
    // le plus exposé du produit, la liste croissant avec l'effectif du camp.
    paddingBottom: PDF_FOOTER_RESERVED_SPACE,
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: '2 solid #333',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#555',
  },
  meta: {
    fontSize: 9,
    color: '#666',
    marginTop: 6,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
    fontSize: 8,
    color: '#555',
  },
  table: {
    width: '100%',
    borderTop: '1 solid #444',
    borderLeft: '1 solid #444',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #ccc',
    minHeight: 22,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottom: '1 solid #444',
    minHeight: 24,
  },
  nameCell: {
    width: '28%',
    padding: 4,
    borderRight: '1 solid #ccc',
    justifyContent: 'center',
  },
  nameCellHeader: {
    width: '28%',
    padding: 4,
    borderRight: '1 solid #444',
    fontWeight: 'bold',
    fontSize: 9,
    justifyContent: 'center',
  },
  dateCell: {
    flex: 1,
    padding: 4,
    borderRight: '1 solid #ccc',
    textAlign: 'center',
    justifyContent: 'center',
  },
  dateCellHeader: {
    flex: 1,
    padding: 4,
    borderRight: '1 solid #444',
    fontWeight: 'bold',
    fontSize: 8,
    textAlign: 'center',
    justifyContent: 'center',
  },
  signatureCell: {
    width: '15%',
    padding: 4,
    textAlign: 'center',
    justifyContent: 'center',
  },
  signatureCellHeader: {
    width: '15%',
    padding: 4,
    fontWeight: 'bold',
    fontSize: 9,
    textAlign: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 9,
  },
  symbol: {
    fontSize: 11,
    textAlign: 'center',
  },
  symbolPresent: {
    color: '#1B5E20',
    fontWeight: 'bold',
  },
  symbolAbsent: {
    color: '#B71C1C',
    fontWeight: 'bold',
  },
  symbolLate: {
    color: '#E65100',
    fontWeight: 'bold',
  },
  symbolExcused: {
    color: '#1565C0',
    fontWeight: 'bold',
  },
  emptyRowText: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#888',
    padding: 12,
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

function formatShortDate(d: Date): string {
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatWeekday(d: Date): string {
  const date = new Date(d);
  const wd = date.toLocaleDateString('fr-FR', { weekday: 'short' });
  return wd.replace('.', '');
}

function renderSymbol(status: AttendanceCell) {
  switch (status) {
    case 'PRESENT':
      return <Text style={[styles.symbol, styles.symbolPresent]}>X</Text>;
    case 'LATE':
      return <Text style={[styles.symbol, styles.symbolLate]}>X*</Text>;
    case 'ABSENT':
      return <Text style={[styles.symbol, styles.symbolAbsent]}>O</Text>;
    case 'EXCUSED':
      return <Text style={[styles.symbol, styles.symbolExcused]}>E</Text>;
    default:
      return <Text style={styles.symbol}> </Text>;
  }
}

// ============================================================================
// COMPOSANT PDF
// ============================================================================

export const AttendanceListPDF: React.FC<{ data: AttendanceListData }> = ({ data }) => {
  const { camp, dates, rows, org, generatedAt, footerMention } = data;
  // A4 paysage si > 6 dates, sinon portrait
  const orientation: 'portrait' | 'landscape' = dates.length > 6 ? 'landscape' : 'portrait';

  const sortedRows = [...rows].sort((a, b) => {
    const ln = a.childLastName.localeCompare(b.childLastName, 'fr');
    if (ln !== 0) return ln;
    return a.childFirstName.localeCompare(b.childFirstName, 'fr');
  });

  return (
    <Document>
      <Page size="A4" orientation={orientation} style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Liste de présence</Text>
          <Text style={styles.subtitle}>{camp.name}</Text>
          <Text style={styles.meta}>
            Lieu : {camp.location} — Du {formatDate(camp.startDate)} au{' '}
            {formatDate(camp.endDate)}
          </Text>
          <View style={styles.legend}>
            <Text>X = Présent</Text>
            <Text>X* = Retard</Text>
            <Text>O = Absent</Text>
            <Text>E = Excusé</Text>
            <Text>(vide) = Non renseigné</Text>
          </View>
        </View>

        {/* Tableau */}
        <View style={styles.table}>
          {/* En-tête — `fixed` : répété en haut du tableau sur chaque page,
              sans quoi les pages suivantes montrent des colonnes de dates
              anonymes. */}
          <View style={styles.tableHeaderRow} fixed wrap={false}>
            <View style={styles.nameCellHeader}>
              <Text>Enfant</Text>
            </View>
            {dates.map((d) => (
              <View key={d.toISOString()} style={styles.dateCellHeader}>
                <Text>{formatWeekday(d)}</Text>
                <Text>{formatShortDate(d)}</Text>
              </View>
            ))}
            <View style={styles.signatureCellHeader}>
              <Text>Signature</Text>
            </View>
          </View>

          {/* Lignes enfants */}
          {sortedRows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.emptyRowText}>
                Aucun enfant inscrit à cet ACM.
              </Text>
            </View>
          ) : (
            sortedRows.map((row, idx) => (
              <View
                key={`${row.childLastName}-${row.childFirstName}-${idx}`}
                style={styles.tableRow}
                wrap={false}
              >
                <View style={styles.nameCell}>
                  <Text style={styles.cellText}>
                    {row.childLastName.toUpperCase()} {row.childFirstName}
                  </Text>
                </View>
                {row.attendances.map((status, i) => (
                  <View key={`${idx}-${i}`} style={styles.dateCell}>
                    {renderSymbol(status)}
                  </View>
                ))}
                <View style={styles.signatureCell}>
                  <Text style={styles.cellText}> </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Footer partagé */}
        <PDFFooter
          org={org}
          mention={footerMention}
          generatedAt={generatedAt}
        />
      </Page>
    </Document>
  );
};
