/**
 * US-UX-03 — le bloc « SIGNATURE DU REPRÉSENTANT LÉGAL » ne doit plus être
 * recouvert par les mentions légales.
 *
 * Cause racine : les autorisations étaient passées en `mention` au `PDFFooter`,
 * lui-même en `position: absolute` (bottom). Sur une fiche remplie, ce bloc
 * absolu se superposait au cadre de signature qui coulait en bas de page.
 *
 * Correctif verrouillé ici :
 *  - les autorisations sont rendues DANS LE FLUX, après le bloc signature ;
 *  - le `PDFFooter` ne reçoit plus de `mention` (coordonnées seules) ;
 *  - la page réserve une marge basse supérieure à la hauteur du footer absolu.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { ChildProfilePDF, generateChildProfilePDFBuffer } from '@/lib/pdf/child-profile-pdf';
import { PDFFooter } from '@/lib/pdf/shared/pdf-footer';
import { flattenTree, elementText } from '@/test/helpers/react-tree';

const AUTHORIZATIONS =
  "1. J'autorise mon enfant à participer aux activités. " +
  "2. J'autorise toute intervention médicale d'urgence. " +
  "3. J'autorise le transport en véhicule associatif. " +
  "4. J'autorise la diffusion de l'image de mon enfant. " +
  '5. Je m’engage à respecter le règlement intérieur.';

const DATA = {
  child: {
    id: '11111111-1111-1111-1111-111111111111',
    firstName: 'Léa',
    lastName: 'MARTIN',
    birthDate: new Date('2015-04-12'),
    gender: 'FEMALE' as const,
    school: 'École de Magenta',
    medicalInfo: {
      allergies: ['Arachides', 'Pollen'],
      medications: ['Ventoline'],
      conditions: ['Asthme'],
      diet_restrictions: ['Sans porc'],
      notes: 'Prévoir un inhalateur en permanence.',
    },
    emergencyContactName: 'Jean MARTIN',
    emergencyContactPhone: '78 45 12',
    emergencyContactRelation: 'FATHER',
  },
  parents: [
    {
      parentId: 'p1',
      firstName: 'Sophie',
      lastName: 'MARTIN',
      email: 's.martin@example.nc',
      phone: '78 90 12',
      homePhone: '25 45 45',
      workPhone: '25 99 99',
      isPrimary: true,
      relationship: 'MOTHER',
    },
  ],
  org: {
    name: 'ALVM',
    legalForm: 'Association loi 1901',
    address: '12 rue des Cocotiers',
    city: 'Nouméa',
    postalCode: '98800',
    country: 'Nouvelle-Calédonie',
    phone: '+687 25 00 00',
    email: 'contact@alvm.nc',
    ridet: '123456.001',
    ape: '9499Z',
  },
  footerMention: AUTHORIZATIONS,
};

describe('ChildProfilePDF — ordre signature / autorisations (US-UX-03)', () => {
  const tree = flattenTree(ChildProfilePDF({ data: DATA }) as React.ReactNode);

  it('rend les autorisations APRÈS le bloc signature', () => {
    const signatureIndex = tree.findIndex((el) =>
      elementText(el) === 'SIGNATURE DU REPRÉSENTANT LÉGAL'
    );
    const authorizationsIndex = tree.findIndex((el) =>
      elementText(el) === AUTHORIZATIONS
    );

    expect(signatureIndex).toBeGreaterThanOrEqual(0);
    expect(authorizationsIndex).toBeGreaterThanOrEqual(0);
    expect(authorizationsIndex).toBeGreaterThan(signatureIndex);
  });

  it('ne passe plus les autorisations au footer absolu', () => {
    const footer = tree.find((el) => el.type === PDFFooter);

    expect(footer).toBeDefined();
    expect((footer!.props as { mention?: string }).mention).toBeUndefined();
  });

  it('garde le bloc signature insécable (wrap={false})', () => {
    const signatureTitle = tree.findIndex((el) =>
      elementText(el) === 'SIGNATURE DU REPRÉSENTANT LÉGAL'
    );
    // Le parent direct du titre est la View de section signature.
    const section = tree
      .slice(0, signatureTitle)
      .reverse()
      .find((el) => (el.props as { wrap?: boolean }).wrap === false);

    expect(section).toBeDefined();
  });

  it('réserve une marge basse supérieure à la hauteur du footer absolu', () => {
    const page = tree.find((el) => (el.props as { size?: string }).size === 'A4');
    const style = (page!.props as { style?: { paddingBottom?: number } }).style;

    // PDFFooter : bottom 16 + ~4 lignes ≈ 55pt. On exige une réserve nette.
    expect(style?.paddingBottom ?? 0).toBeGreaterThanOrEqual(80);
  });

  it('produit un PDF valide de bout en bout', async () => {
    const buffer = await generateChildProfilePDFBuffer(DATA);

    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
