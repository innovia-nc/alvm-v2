/**
 * Service de génération PDF pour les factures
 * Utilise @react-pdf/renderer pour créer des PDFs professionnels
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import { PDFFooter, type OrgInfo } from './shared/pdf-footer';

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  status?: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
  };
  lines: InvoiceLine[];
  subtotalHt: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  paidAmount: number;
  org: OrgInfo;
  footerMention?: string;
  logoUrl?: string;
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    width: 120,
    alignItems: 'flex-end',
  },
  logo: {
    width: 100,
    height: 'auto',
    maxHeight: 80,
    objectFit: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
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
  totalLabel: {
    fontWeight: 'bold',
  },
  totalValue: {
    textAlign: 'right',
  },
  grandTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    paddingTop: 10,
    borderTop: '2 solid #000',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    paddingTop: 10,
    borderTop: '1 solid #ccc',
    fontSize: 8,
    color: '#666',
    textAlign: 'justify',
  },
});

// ============================================================================
// COMPOSANT PDF
// ============================================================================

export const InvoicePDF: React.FC<{ data: InvoiceData }> = ({ data }) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number) => {
    // Formater manuellement car toLocaleString ne fonctionne pas dans @react-pdf/renderer
    const formattedNumber = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${formattedNumber} XPF`;
  };

  const remainingAmount = data.totalAmount - data.paidAmount;

  // Déterminer si c'est un devis ou une facture
  const isQuote = data.status === 'DRAFT';
  const documentType = isQuote ? 'DEVIS' : 'FACTURE';
  const documentNumberLabel = isQuote ? 'Numéro de devis' : 'Numéro de facture';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{documentType}</Text>
            <Text style={styles.companyInfo}>{data.org.name}</Text>
            {data.org.address && (
              <Text style={styles.companyInfo}>{data.org.address}</Text>
            )}
            {(data.org.postalCode || data.org.city) && (
              <Text style={styles.companyInfo}>
                {[data.org.postalCode, data.org.city].filter(Boolean).join(' ')}
                {data.org.country ? `, ${data.org.country}` : ''}
              </Text>
            )}
            {data.org.email && (
              <Text style={styles.companyInfo}>Email: {data.org.email}</Text>
            )}
          </View>
          {data.logoUrl && (
            <View style={styles.headerRight}>
              <Image src={data.logoUrl} style={styles.logo} />
            </View>
          )}
        </View>

        {/* Invoice Info */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>{documentNumberLabel} :</Text>
            <Text style={styles.value}>{data.invoiceNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date d'émission :</Text>
            <Text style={styles.value}>{formatDate(data.issueDate)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{isQuote ? 'Validité' : 'Date d\'échéance'} :</Text>
            <Text style={styles.value}>{formatDate(data.dueDate)}</Text>
          </View>
        </View>

        {/* Client Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{isQuote ? 'DEVIS POUR' : 'FACTURÉ À'}</Text>
          <Text>{data.parent.firstName} {data.parent.lastName}</Text>
          <Text>{data.parent.address}</Text>
          <Text>{data.parent.postalCode} {data.parent.city}</Text>
          <Text>{data.parent.email}</Text>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <Text style={styles.sectionTitle}>{isQuote ? 'DÉTAILS DU DEVIS' : 'DÉTAILS DE LA FACTURE'}</Text>

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
              <Text style={styles.col4}>{formatCurrency(line.totalPrice)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sous-total HT :</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.subtotalHt)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Taxes ({data.taxRate}%) :</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.taxAmount)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total TTC :</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.totalAmount)}</Text>
          </View>

          {data.paidAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Déjà payé :</Text>
              <Text style={styles.totalValue}>-{formatCurrency(data.paidAmount)}</Text>
            </View>
          )}

          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>MONTANT DÛ :</Text>
            <Text>{formatCurrency(remainingAmount)}</Text>
          </View>
        </View>

        {/* Footer partagé */}
        <PDFFooter
          org={data.org}
          mention={data.footerMention}
          generatedAt={new Date()}
        />
      </Page>
    </Document>
  );
};

// ============================================================================
// FONCTION DE GÉNÉRATION
// ============================================================================

/**
 * Génère un PDF pour une facture
 * @param data Données de la facture
 * @returns Buffer du PDF généré
 */
export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const buffer = await renderToBuffer(<InvoicePDF data={data} />);
  return Buffer.from(buffer);
}
