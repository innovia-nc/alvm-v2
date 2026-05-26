import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/server/db';
import { auth } from '@/lib/auth';
import { StaffProfilePDF } from '@/lib/pdf/staff-profile-pdf';
import { getPdfSettings } from '@/server/helpers/pdf-settings.helper';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ staffid: string }> },
) {
    const { staffid } = await params;

    // AuthN + AuthZ : staff / admin uniquement (donnees RGPD personnel)
    const session = await auth();
    if (!session?.user) {
        return new NextResponse('Non authentifié', { status: 401 });
    }
    if (session.user.role !== 'STAFF' && session.user.role !== 'ADMIN') {
        return new NextResponse('Non autorisé', { status: 403 });
    }

    const staffUser = await prisma.user.findUnique({
        where: { id: staffid },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            staffMember: {
                select: {
                    userId: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    email: true,
                },
            },
        },
    });

    if (!staffUser || !staffUser.staffMember) {
        return new NextResponse('Non trouvé', { status: 404 });
    }

    const settings = await getPdfSettings(prisma);

    const pdfData = {
        staff: {
            userId: staffUser.id,
            email: staffUser.email,
            name: staffUser.name,
            role: staffUser.role,
            emailVerified: staffUser.emailVerified,
            createdAt: staffUser.createdAt,
            updatedAt: staffUser.updatedAt,
            profile: {
                id: staffUser.staffMember.userId,
                firstName: staffUser.staffMember.firstName,
                lastName: staffUser.staffMember.lastName,
                phone: staffUser.staffMember.phone,
                email: staffUser.staffMember.email,
            },
        },
        org: settings.org,
        footerMention: settings.mentions.staffProfile || undefined,
    };

    const element = React.createElement(StaffProfilePDF, { data: pdfData });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    return new NextResponse(stream as unknown as ReadableStream, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="fiche-${staffUser.staffMember.firstName}-${staffUser.staffMember.lastName}.pdf"`,
        },
    });
}
