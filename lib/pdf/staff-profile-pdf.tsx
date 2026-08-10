import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Image,
} from '@react-pdf/renderer';
import { PDFFooter, PDF_FOOTER_RESERVED_SPACE, type OrgInfo } from './shared/pdf-footer';

// ============================================================================
// TYPES
// ============================================================================

type StaffProfileData = {
    staff: {
        userId: string;
        email: string;
        name: string | null;
        role: 'PARENT' | 'STAFF' | 'ADMIN';
        emailVerified: Date | string | null;
        createdAt: Date | string;
        updatedAt: Date | string;

        profile: {
            id: string;
            firstName: string;
            lastName: string;
            phone: string | null;
            email: string;
        };
    };
    org: OrgInfo;
    logoUrl?: string | null;
    footerMention?: string;
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
    page: {
        padding: 40,
        // TD-004 : le pied de page est hors du flux, il faut lui réserver sa
        // place sous peine de voir le bloc signature le recouvrir (US-UX-03
        // sur la fiche enfant, structurellement identique).
        paddingBottom: PDF_FOOTER_RESERVED_SPACE,
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
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#1a1a1a',
    },
    subtitle: {
        fontSize: 10,
        color: '#666',
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: 'bold',
        marginBottom: 10,
        backgroundColor: '#e5e7eb',
        padding: 6,
        color: '#374151',
    },
    card: {
        marginBottom: 15,
        padding: 12,
        backgroundColor: '#f9fafb',
        border: '1 solid #e5e7eb',
        borderRadius: 4,
    },
    row: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    label: {
        width: '35%',
        fontWeight: 'bold',
        color: '#4b5563',
    },
    value: {
        width: '65%',
        color: '#111827',
    },
    badge: {
        fontSize: 9,
        backgroundColor: '#2563eb',
        color: '#ffffff',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    signatureSection: {
        marginTop: 40,
    },
    signatureBox: {
        marginTop: 10,
        height: 70,
        border: '1 solid #d1d5db',
        borderRadius: 4,
        backgroundColor: '#fefefe',
    },
});

// ============================================================================
// COMPONENT PDF
// ============================================================================

export const StaffProfilePDF: React.FC<{ data: StaffProfileData }> = ({ data }) => {
    const { staff, org, logoUrl, footerMention } = data;

    const formatDate = (d: Date | string | null) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('fr-FR');
    };

    const formatRole = (role: string) => {
        switch (role) {
            case 'STAFF': return 'Personnel';
            case 'ADMIN': return 'Administrateur';
            default: return 'Utilisateur';
        }
    };

    return (
        <Document title={`Fiche Personnel - ${staff.profile.lastName}`}>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>FICHE PERSONNEL</Text>
                        <Text style={styles.subtitle}>{org.name}</Text>
                    </View>
                    {logoUrl && (
                        <Image style={styles.logo} src={logoUrl} />
                    )}
                </View>

                {/* Section Identité */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>IDENTITÉ ET CONTACT</Text>
                    <View style={styles.card}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Prénom / Nom :</Text>
                            <Text style={styles.value}>{staff.profile.firstName} {staff.profile.lastName}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Email professionnel :</Text>
                            <Text style={styles.value}>{staff.email}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Téléphone :</Text>
                            <Text style={styles.value}>{staff.profile.phone ?? 'Non renseigné'}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Rôle système :</Text>
                            <View style={{ flexDirection: 'row' }}>
                                <Text style={styles.badge}>{formatRole(staff.role)}</Text>
                            </View>
                        </View>
                        {/* On a bien fermé le bloc Role avant de commencer celui-ci */}
                        <View style={styles.row}>
                            <Text style={styles.label}>Compte vérifié :</Text>
                            <Text style={styles.value}>{staff.emailVerified ? 'Oui' : 'Non'}</Text>
                        </View>
                    </View>
                </View>

                {/* Section Administration */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>DÉTAILS ADMINISTRATIFS</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Date de création :</Text>
                        <Text style={styles.value}>{formatDate(staff.createdAt)}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Dernière mise à jour :</Text>
                        <Text style={styles.value}>{formatDate(staff.updatedAt)}</Text>
                    </View>
                </View>

                {/* Zone Signature */}
                <View style={styles.signatureSection}>
                    <Text style={{ fontWeight: 'bold', fontSize: 10 }}>Cachet et Signature de la direction :</Text>
                    <View style={styles.signatureBox} />
                    <Text style={{ fontSize: 8, marginTop: 5, color: '#666' }}>
                        Document édité le {formatDate(new Date())}
                    </Text>
                </View>

                {/* Footer partagé */}
                <PDFFooter
                    org={org}
                    mention={footerMention}
                    generatedAt={new Date()}
                />
            </Page>
        </Document>
    );
};