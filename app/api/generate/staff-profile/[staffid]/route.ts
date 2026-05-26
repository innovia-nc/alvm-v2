import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/server/db';
import { StaffProfilePDF } from '@/lib/pdf/staff-profile-pdf';
import { getPdfSettings } from '@/server/helpers/pdf-settings.helper';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ staffid: string }> },
) {
    const { staffid } = await params;

    const staffUser = await prisma.user.findUnique({
        where: { id: staffid },
        include: { staffMember: true },
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
            profile: staffUser.staffMember,
        },
        org: settings.org,
        footerMention: settings.mentions.staffProfile || undefined,
    };

    const element = React.createElement(StaffProfilePDF as any, {
        data: pdfData as any,
    });

    const stream = await renderToStream(element as any);

    return new NextResponse(stream as any, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="fiche-${staffUser.staffMember.firstName}-${staffUser.staffMember.lastName}.pdf"`,
        },
    });
}
