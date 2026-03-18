/**
 * Service de génération PDF pour les fiches enfant
 * Utilise @react-pdf/renderer pour créer des PDFs professionnels
 *
 * Architecture multi-parents :
 * - Affiche tous les parents associés (1 à 3)
 * - Badge "Parent principal" pour le parent primaire
 * - Affiche la relation (mère, père, tuteur, etc.)
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

// ============================================================================
// TYPES
// ============================================================================

interface ChildParent {
  parentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  isPrimary: boolean;
  relationship: string | null;
}

interface MedicalInfo {
  allergies?: string[];
  medications?: string[];
  conditions?: string[];
  diet_restrictions?: string[];
  notes?: string;
}

interface ChildProfileData {
  child: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    school: string | null;
    medicalInfo: MedicalInfo;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelation: string | null;
  };
  parents: ChildParent[];
  organization: {
    name: string;
    logoUrl?: string | null;
  };
  footerMention?: string;
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottom: '2 solid #333',
  },
  headerText: {
    flex: 1,
  },
  logo: {
    width: 80,
    height: 80,
    objectFit: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
    padding: 8,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    width: '40%',
    fontWeight: 'bold',
    color: '#555',
  },
  value: {
    width: '60%',
    color: '#000',
  },
  parentCard: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fafafa',
    border: '1 solid #e0e0e0',
    borderRadius: 4,
  },
  parentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  parentName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000',
  },
  primaryBadge: {
    fontSize: 8,
    backgroundColor: '#4CAF50',
    color: '#ffffff',
    padding: '3 6',
    borderRadius: 3,
  },
  relationshipBadge: {
    fontSize: 8,
    backgroundColor: '#2196F3',
    color: '#ffffff',
    padding: '3 6',
    borderRadius: 3,
    marginLeft: 5,
  },
  parentDetail: {
    fontSize: 9,
    marginBottom: 3,
    color: '#666',
  },
  medicalSection: {
    backgroundColor: '#fff3cd',
    padding: 10,
    border: '1 solid #ffc107',
    borderRadius: 4,
  },
  medicalTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#856404',
  },
  medicalItem: {
    fontSize: 9,
    marginBottom: 4,
    color: '#333',
  },
  medicalLabel: {
    fontWeight: 'bold',
    color: '#856404',
  },
  listItem: {
    fontSize: 9,
    marginLeft: 10,
    marginBottom: 2,
    color: '#333',
  },
  signatureSection: {
    marginTop: 30,
    marginBottom: 20,
    paddingTop: 15,
    borderTop: '1 solid #e0e0e0',
  },
  signatureTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  signatureBox: {
    marginTop: 10,
    padding: 15,
    height: 80,
    border: '1 solid #ccc',
    borderRadius: 4,
    backgroundColor: '#fafafa',
  },
  signatureLabel: {
    fontSize: 9,
    color: '#666',
    marginTop: 10,
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
  emptyState: {
    fontStyle: 'italic',
    color: '#999',
  },
});

// ============================================================================
// COMPOSANT PDF
// ============================================================================

export const ChildProfilePDF: React.FC<{ data: ChildProfileData }> = ({ data }) => {
  const { child, parents, organization, footerMention } = data;

  // Formatage de la date de naissance
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('fr-FR');
  };

  // Calcul de l'âge
  const calculateAge = (birthDate: Date) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  };

  // Formatage du genre
  const formatGender = (gender: string) => {
    switch (gender) {
      case 'MALE':
        return 'Masculin';
      case 'FEMALE':
        return 'Féminin';
      case 'OTHER':
        return 'Autre';
      default:
        return gender;
    }
  };

  // Formatage de la relation
  const formatRelationship = (relationship: string | null) => {
    if (!relationship) return null;

    const relations: Record<string, string> = {
      mother: 'Mère',
      father: 'Père',
      guardian: 'Tuteur/Tutrice',
      step_mother: 'Belle-mère',
      step_father: 'Beau-père',
      grandparent: 'Grand-parent',
      other: 'Autre',
    };

    return relations[relationship] || relationship;
  };

  // Tri des parents : parent principal en premier
  const sortedParents = [...parents].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header avec logo */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>FICHE ENFANT</Text>
            <Text style={styles.subtitle}>{organization.name}</Text>
          </View>
          {organization.logoUrl && (
            <Image style={styles.logo} src={organization.logoUrl} />
          )}
        </View>

        {/* Informations générales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INFORMATIONS GÉNÉRALES</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Prénom :</Text>
            <Text style={styles.value}>{child.firstName}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Nom :</Text>
            <Text style={styles.value}>{child.lastName}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Date de naissance :</Text>
            <Text style={styles.value}>
              {formatDate(child.birthDate)} ({calculateAge(child.birthDate)} ans)
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Genre :</Text>
            <Text style={styles.value}>{formatGender(child.gender)}</Text>
          </View>

          {child.school && (
            <View style={styles.row}>
              <Text style={styles.label}>École :</Text>
              <Text style={styles.value}>{child.school}</Text>
            </View>
          )}
        </View>

        {/* Parents associés */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            PARENTS ASSOCIÉS ({sortedParents.length})
          </Text>

          {sortedParents.map((parent, index) => (
            <View key={index} style={styles.parentCard}>
              <View style={styles.parentHeader}>
                <Text style={styles.parentName}>
                  {parent.firstName} {parent.lastName}
                </Text>
                <View style={{ flexDirection: 'row' }}>
                  {parent.isPrimary && (
                    <Text style={styles.primaryBadge}>★ Parent principal</Text>
                  )}
                  {parent.relationship && (
                    <Text style={styles.relationshipBadge}>
                      {formatRelationship(parent.relationship)}
                    </Text>
                  )}
                </View>
              </View>

              <Text style={styles.parentDetail}>
                📞 Téléphone : {parent.phone}
              </Text>

              {parent.email && (
                <Text style={styles.parentDetail}>
                  ✉ Email : {parent.email}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Informations médicales */}
        <View style={styles.section}>
          <View style={styles.medicalSection}>
            <Text style={styles.medicalTitle}>⚕ INFORMATIONS MÉDICALES</Text>

            {/* Allergies */}
            {child.medicalInfo.allergies && child.medicalInfo.allergies.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.medicalItem}>
                  <Text style={styles.medicalLabel}>Allergies :</Text>
                </Text>
                {child.medicalInfo.allergies.map((allergy, idx) => (
                  <Text key={idx} style={styles.listItem}>
                    • {allergy}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Médicaments */}
            {child.medicalInfo.medications && child.medicalInfo.medications.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.medicalItem}>
                  <Text style={styles.medicalLabel}>Médicaments :</Text>
                </Text>
                {child.medicalInfo.medications.map((med, idx) => (
                  <Text key={idx} style={styles.listItem}>
                    • {med}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Conditions médicales */}
            {child.medicalInfo.conditions && child.medicalInfo.conditions.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.medicalItem}>
                  <Text style={styles.medicalLabel}>Conditions médicales :</Text>
                </Text>
                {child.medicalInfo.conditions.map((condition, idx) => (
                  <Text key={idx} style={styles.listItem}>
                    • {condition}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Restrictions alimentaires */}
            {child.medicalInfo.diet_restrictions &&
            child.medicalInfo.diet_restrictions.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.medicalItem}>
                  <Text style={styles.medicalLabel}>Restrictions alimentaires :</Text>
                </Text>
                {child.medicalInfo.diet_restrictions.map((diet, idx) => (
                  <Text key={idx} style={styles.listItem}>
                    • {diet}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Notes médicales */}
            {child.medicalInfo.notes && child.medicalInfo.notes.trim() ? (
              <View>
                <Text style={styles.medicalItem}>
                  <Text style={styles.medicalLabel}>Notes :</Text>
                </Text>
                <Text style={[styles.medicalItem, { marginTop: 4 }]}>
                  {child.medicalInfo.notes}
                </Text>
              </View>
            ) : null}

            {/* Message si aucune info médicale */}
            {(!child.medicalInfo.allergies || child.medicalInfo.allergies.length === 0) &&
              (!child.medicalInfo.medications || child.medicalInfo.medications.length === 0) &&
              (!child.medicalInfo.conditions || child.medicalInfo.conditions.length === 0) &&
              (!child.medicalInfo.diet_restrictions ||
                child.medicalInfo.diet_restrictions.length === 0) &&
              (!child.medicalInfo.notes || !child.medicalInfo.notes.trim()) && (
                <Text style={styles.emptyState}>
                  Aucune information médicale renseignée.
                </Text>
              )}
          </View>
        </View>

        {/* Contact d'urgence */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTACT D'URGENCE</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Nom :</Text>
            <Text style={styles.value}>{child.emergencyContactName}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Téléphone :</Text>
            <Text style={styles.value}>{child.emergencyContactPhone}</Text>
          </View>

          {child.emergencyContactRelation && (
            <View style={styles.row}>
              <Text style={styles.label}>Relation :</Text>
              <Text style={styles.value}>{formatRelationship(child.emergencyContactRelation)}</Text>
            </View>
          )}
        </View>

        {/* Section signature */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureTitle}>SIGNATURE DU REPRÉSENTANT LÉGAL</Text>
          <View style={styles.signatureBox}>
            {/* Espace vide pour signature manuscrite */}
          </View>
          <Text style={styles.signatureLabel}>
            Date : ___ / ___ / _______     Signature :
          </Text>
        </View>

        {/* Footer avec mention obligatoire */}
        {footerMention && (
          <View style={styles.footer}>
            <Text>{footerMention}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
};

// ============================================================================
// FONCTION DE GÉNÉRATION DU BUFFER PDF
// ============================================================================

/**
 * Génère un buffer PDF à partir des données de la fiche enfant
 *
 * @param data - Données de la fiche enfant
 * @returns Buffer contenant le PDF
 */
export async function generateChildProfilePDFBuffer(
  data: ChildProfileData
): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  // renderToBuffer retourne un Uint8Array, on le convertit en Buffer Node.js
  const uint8Array = await renderToBuffer(<ChildProfilePDF data={data} />);
  return Buffer.from(uint8Array);
}
