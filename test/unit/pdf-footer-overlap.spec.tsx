/**
 * TD-004 — aucun document ne doit écrire sous son pied de page.
 *
 * `PDFFooter` est en `position: absolute` : il sort du flux, donc le contenu
 * qui coule en bas de page passe DESSOUS si la page ne lui réserve pas sa
 * place (`PDF_FOOTER_RESERVED_SPACE`). Ce défaut est remonté deux fois en
 * recette — US-UX-03 (bloc signature de la fiche enfant) puis US-FACT-01-bis
 * (modes de règlement au-delà de 4) — sur deux documents différents.
 *
 * Le verrou porte sur le PDF **réellement rendu** : un test d'arbre React ne
 * verrait pas le problème, qui n'apparaît qu'au calcul de mise en page.
 * Chaque document est alimenté avec assez de contenu pour remplir sa page.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { readPdfLayout, type TextBlock } from '@/test/helpers/pdf-layout';
import { PDF_FOOTER_RESERVED_SPACE, type OrgInfo } from '@/lib/pdf/shared/pdf-footer';
import { InvoicePDF } from '@/lib/pdf/invoice-pdf';
import { CreditNotePDF } from '@/lib/pdf/credit-note-pdf';
import { ChildProfilePDF } from '@/lib/pdf/child-profile-pdf';
import { StaffProfilePDF } from '@/lib/pdf/staff-profile-pdf';
import { AttendanceListPDF, type AttendanceCell } from '@/lib/pdf/attendance-list-pdf';

// ---------------------------------------------------------------------------
// Fixtures — chaque champ du pied de page porte un marqueur reconnaissable,
// pour distinguer sans ambiguïté le pied de page du contenu du document.
// ---------------------------------------------------------------------------

const ORG: OrgInfo = {
  name: 'ORGMARQUEUR Association Loisirs Vacances Municipales',
  legalForm: 'FORMEMARQUEUR loi 1901',
  ridet: 'RIDETMARQUEUR.001',
  address: 'ADRESSEMARQUEUR, 12 rue de la Republique',
  city: 'VILLEMARQUEUR',
  postalCode: '98800',
  country: 'PAYSMARQUEUR',
  phone: 'TELMARQUEUR',
  email: 'EMAILMARQUEUR@alvm.nc',
  ape: 'APEMARQUEUR',
};

const MENTION = 'MENTIONMARQUEUR — exoneration de TGC au titre de l\'article LP 492.';

// Tout ce que rend le pied de page porte « MARQUEUR », sauf sa ligne méta.
// Aucun marqueur ne doit pouvoir apparaître dans le corps du document : le code
// postal de l'organisation, par exemple, serait ambigu avec celui du client.
const FOOTER_MARKERS = ['MARQUEUR', 'Imprimé le'];

const PARENT = {
  firstName: 'Sophie',
  lastName: 'MARTIN',
  email: 's.martin@example.nc',
  address: '12 rue des Cocotiers',
  city: 'Noumea',
  postalCode: '98850',
};

function isFooterText(text: string): boolean {
  // Le motif de pagination est reconnu sur sa forme exacte (`1 / 2`, espaces
  // compris) : sans les espaces il collerait aussi aux montants, dont le
  // séparateur de milliers insécable se décode comme un « / ».
  return FOOTER_MARKERS.some((m) => text.includes(m)) || /^\d+ \/ \d+$/.test(text.trim());
}

/**
 * Vérifie qu'aucun bloc de texte du document n'empiète sur la bande réservée
 * au pied de page, et que le pied de page tient bien dans cette bande.
 */
async function expectNoFooterOverlap(
  element: React.ReactElement<DocumentProps>,
  label: string,
) {
  const pages = readPdfLayout(await renderToBuffer(element));
  expect(pages.length, `${label} : aucune page rendue`).toBeGreaterThan(0);

  for (const page of pages) {
    // La bande occupée par le pied de page est mesurée sur le rendu, PAS
    // déduite de PDF_FOOTER_RESERVED_SPACE : sans quoi réduire la réserve
    // réduirait aussi la zone contrôlée et le test passerait à vide.
    // Les lignes du pied de page se replient : plusieurs blocs partagent alors
    // la même ligne de base. On raisonne donc par ligne, pas par bloc.
    const nearBottom = page.blocks.filter((b) => b.y < 200);
    const footerBaselines = new Set(
      nearBottom.filter((b) => isFooterText(b.text)).map((b) => b.y.toFixed(1)),
    );

    expect(
      footerBaselines.size,
      `${label} p.${page.index} : pied de page introuvable en bas de page`,
    ).toBeGreaterThan(0);

    const footerTop = Math.max(...[...footerBaselines].map(Number));

    const intruders: TextBlock[] = nearBottom.filter(
      (b) => b.y <= footerTop && !footerBaselines.has(b.y.toFixed(1)),
    );

    expect(
      intruders.map((b) => `y=${b.y.toFixed(1)} « ${b.text.slice(0, 40)} »`),
      `${label} p.${page.index} : du contenu passe sous le pied de page`,
    ).toEqual([]);

    // Et le pied de page doit tenir dans la réserve annoncée, sinon il déborde
    // vers le haut et vient recouvrir le contenu.
    expect(
      footerTop,
      `${label} p.${page.index} : le pied de page dépasse la réserve de ${PDF_FOOTER_RESERVED_SPACE}pt`,
    ).toBeLessThan(PDF_FOOTER_RESERVED_SPACE);
  }
}

// ---------------------------------------------------------------------------
// Tests — un document par cas, alimenté pour remplir la page
// ---------------------------------------------------------------------------

describe('TD-004 — aucun contenu ne passe sous le pied de page', () => {
  it('facture avec de nombreux règlements (US-FACT-01-bis)', async () => {
    await expectNoFooterOverlap(
      <InvoicePDF
        data={{
          invoiceNumber: 'FAC-2026-0042',
          issueDate: new Date('2026-08-01'),
          dueDate: new Date('2026-08-31'),
          status: 'SENT',
          parent: PARENT,
          lines: Array.from({ length: 8 }, (_, i) => ({
            description: `Sejour ${i + 1}`,
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
          })),
          payments: Array.from({ length: 12 }, () => ({
            amount: 500,
            paymentDate: new Date('2026-08-05'),
            paymentMethod: 'Cheque',
          })),
          subtotalHt: 8000,
          taxAmount: 0,
          taxRate: 0,
          totalAmount: 8000,
          paidAmount: 6000,
          org: ORG,
          footerMention: MENTION,
        }}
      />,
      'facture',
    );
  }, 60000);

  it('avoir à nombreuses lignes', async () => {
    await expectNoFooterOverlap(
      <CreditNotePDF
        data={{
          creditNoteNumber: 'AVO-2026-0007',
          issueDate: new Date('2026-08-01'),
          invoiceNumber: 'FAC-2026-0042',
          parent: PARENT,
          lines: Array.from({ length: 25 }, (_, i) => ({
            description: `Ligne d'avoir ${i + 1}`,
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
          })),
          totalAmount: 25000,
          reason: 'Annulation de sejour a la demande de la famille.',
          org: ORG,
          footerMention: MENTION,
        }}
      />,
      'avoir',
    );
  }, 60000);

  it('fiche enfant avec 3 parents et dossier médical fourni (US-UX-03)', async () => {
    await expectNoFooterOverlap(
      <ChildProfilePDF
        data={{
          child: {
            id: 'c1',
            firstName: 'Lea',
            lastName: 'DUPONT',
            birthDate: new Date('2016-04-12'),
            gender: 'FEMALE',
            school: 'Ecole des Cocotiers',
            medicalInfo: {
              allergies: ['arachides', 'pollen', 'acariens'],
              medications: ['ventoline'],
              conditions: ['asthme'],
              diet_restrictions: ['sans porc'],
              notes: 'Prevoir la ventoline a chaque sortie.',
            },
            emergencyContactName: 'Marie DUPONT',
            emergencyContactPhone: '00 00 00',
            emergencyContactRelation: 'Mere',
          },
          parents: Array.from({ length: 3 }, (_, i) => ({
            parentId: `p${i}`,
            firstName: `Parent${i + 1}`,
            lastName: 'DUPONT',
            email: `p${i}@example.nc`,
            phone: '00 00 00',
            homePhone: '00 00 01',
            workPhone: '00 00 02',
            isPrimary: i === 0,
            relationship: 'mother',
          })),
          org: ORG,
          footerMention: MENTION,
        }}
      />,
      'fiche enfant',
    );
  }, 60000);

  it('fiche personnel (bloc signature en bas de page)', async () => {
    await expectNoFooterOverlap(
      <StaffProfilePDF
        data={{
          staff: {
            userId: 'u1',
            email: 'agent@alvm.nc',
            name: 'Agent TEST',
            role: 'STAFF',
            emailVerified: new Date('2026-01-01'),
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-08-01'),
            profile: {
              id: 's1',
              firstName: 'Agent',
              lastName: 'TEST',
              phone: '00 00 00',
              email: 'agent@alvm.nc',
            },
          },
          org: ORG,
          footerMention: MENTION,
        }}
      />,
      'fiche personnel',
    );
  }, 60000);

  it('liste de présence d\'un camp à fort effectif', async () => {
    await expectNoFooterOverlap(
      <AttendanceListPDF
        data={{
          camp: {
            name: 'ACM Aout 2026',
            location: 'Centre municipal',
            startDate: new Date('2026-08-03'),
            endDate: new Date('2026-08-07'),
          },
          dates: Array.from({ length: 5 }, (_, i) => new Date(2026, 7, 3 + i)),
          rows: Array.from({ length: 45 }, (_, i) => ({
            childFirstName: `Enfant${i + 1}`,
            childLastName: `NOM${String(i + 1).padStart(2, '0')}`,
            attendances: [null, 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttendanceCell[],
          })),
          org: ORG,
          generatedAt: new Date('2026-08-10'),
          footerMention: MENTION,
        }}
      />,
      'liste de presence',
    );
  }, 60000);
});
