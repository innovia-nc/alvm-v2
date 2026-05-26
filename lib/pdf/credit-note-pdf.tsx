/**
 * Service de génération PDF pour les avoirs (credit notes)
 * Utilise @react-pdf/renderer pour créer des PDFs professionnels
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';

// ============================================================================
// TYPES
// ============================================================================

interface CreditNoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface CreditNoteData {
  creditNoteNumber: string;
  issueDate: Date;
  invoiceNumber: string;
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
  };
  lines: CreditNoteLine[];
  totalAmount: number;
  reason: string;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#dc2626', // Rouge pour l'avoir
  },
  companyInfo: {
    fontSize: 10,
    marginBottom: 5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    borderBottom: '1 solid #000',
    paddingBottom: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  label: {
    width: '30%',
    fontWeight: 'bold',
  },
  value: {
    width: '70%',
  },
  reasonBox: {
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 4,
    marginTop: 10,
  },
  reasonText: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    padding: 8,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e0e0e0',
    padding: 8,
  },
  col1: {
    width: '50%',
  },
  col2: {
    width: '15%',
    textAlign: 'right',
  },
  col3: {
    width: '20%',
    textAlign: 'right',
  },
  col4: {
    width: '15%',
    textAlign: 'right',
  },
  totalSection: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    width: '40%',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  grandTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    paddingTop: 10,
    borderTop: '2 solid #dc2626',
    color: '#dc2626',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
  },
  watermark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(-45deg)',
    fontSize: 60,
    color: '#fee2e2',
    opacity: 0.3,
    fontWeight: 'bold',
  },
});

// ============================================================================
// COMPOSANT PDF
// ============================================================================

export const CreditNotePDF: React.FC<{ data: CreditNoteData }> = ({ data }) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString('fr-FR')} XPF`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark */}
        <Text style={styles.watermark}>AVOIR</Text>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AVOIR N° {data.creditNoteNumber}</Text>
        </View>

        {/* Credit Note Info */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Numéro d'avoir :</Text>
            <Text style={styles.value}>{data.creditNoteNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date d'émission :</Text>
            <Text style={styles.value}>{formatDate(data.issueDate)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Facture concernée :</Text>
            <Text style={styles.value}>{data.invoiceNumber}</Text>
          </View>
        </View>

        {/* Client Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLIENT</Text>
          <Text>{data.parent.firstName} {data.parent.lastName}</Text>
          <Text>{data.parent.address}</Text>
          <Text>{data.parent.postalCode} {data.parent.city}</Text>
          <Text>{data.parent.email}</Text>
        </View>

        {/* Reason */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MOTIF DE L'AVOIR</Text>
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText}>{data.reason}</Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <Text style={styles.sectionTitle}>DÉTAILS DE L'AVOIR</Text>

          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.col1}>Description</Text>
            <Text style={styles.col2}>Quantité</Text>
            <Text style={styles.col3}>Prix unitaire</Text>
            <Text style={styles.col4}>Total</Text>
          </View>

          {/* Table Rows */}
          {data.lines.map((line, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.col1}>{line.description}</Text>
              <Text style={styles.col2}>{line.quantity}</Text>
              <Text style={styles.col3}>{formatCurrency(line.unitPrice)}</Text>
              <Text style={styles.col4}>-{formatCurrency(line.totalPrice)}</Text>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>MONTANT DE L'AVOIR :</Text>
            <Text>-{formatCurrency(data.totalAmount)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Cet avoir sera déduit du solde de votre compte ou donnera lieu à un remboursement.
          </Text>
        </View>
      </Page>
    </Document>
  );
};

// ============================================================================
// FONCTION DE GÉNÉRATION
// ============================================================================

/**
 * Génère un PDF pour un avoir
 * @param data Données de l'avoir
 * @returns Buffer du PDF généré
 */
export async function generateCreditNotePDF(data: CreditNoteData): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const buffer = await renderToBuffer(<CreditNotePDF data={data} />);
  return Buffer.from(buffer);
}
