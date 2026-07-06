import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/server/db';
import { auth } from '@/lib/auth';
import { ChildProfilePDF } from '@/lib/pdf/child-profile-pdf';
import { getPdfSettings } from '@/server/helpers/pdf-settings.helper';

// La génération PDF (@react-pdf/renderer) peut dépasser le timeout serverless par défaut.
export const maxDuration = 60;

type MedicalInfoShape = {
    allergies?: string[];
    medications?: string[];
    conditions?: string[];
    diet_restrictions?: string[];
    notes?: string;
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ childId: string }> },
) {
    const { childId } = await params;

    // AuthN + AuthZ : staff / admin uniquement (donnees RGPD enfant)
    const session = await auth();
    if (!session?.user) {
        return new NextResponse('Non authentifié', { status: 401 });
    }
    if (session.user.role !== 'STAFF' && session.user.role !== 'ADMIN') {
        return new NextResponse('Non autorisé', { status: 403 });
    }

    const child = await prisma.child.findUnique({
        where: { id: childId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            gender: true,
            ecole: true,
            medicalInfo: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
            emergencyContactRelation: true,
            parentLinks: {
                select: {
                    parentId: true,
                    isPrimary: true,
                    relationship: true,
                    parent: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                            homePhone: true,
                            workPhone: true,
                        },
                    },
                },
            },
        },
    });

    if (!child) return new NextResponse('Non trouvé', { status: 404 });

    const parents = child.parentLinks.map((pl) => ({
        parentId: pl.parentId,
        firstName: pl.parent.firstName,
        lastName: pl.parent.lastName,
        email: pl.parent.email,
        phone: pl.parent.phone,
        homePhone: pl.parent.homePhone,
        workPhone: pl.parent.workPhone,
        isPrimary: pl.isPrimary,
        relationship: pl.relationship,
    }));

    const settings = await getPdfSettings(prisma);

    const pdfData = {
        child: {
            id: child.id,
            firstName: child.firstName,
            lastName: child.lastName,
            birthDate: child.birthDate,
            gender: child.gender,
            school: child.ecole,
            medicalInfo: ((child.medicalInfo ?? {}) as unknown) as MedicalInfoShape,
            emergencyContactName: child.emergencyContactName,
            emergencyContactPhone: child.emergencyContactPhone,
            emergencyContactRelation: child.emergencyContactRelation,
        },
        parents,
        org: settings.org,
        footerMention: settings.mentions.childProfile || undefined,
    };

    const element = React.createElement(ChildProfilePDF, { data: pdfData });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    return new NextResponse(stream as unknown as ReadableStream, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="fiche-${child.firstName}-${child.lastName}.pdf"`,
        },
    });
}
