import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/server/db';
import { ChildProfilePDF } from '@/lib/pdf/child-profile-pdf';

export async function GET(req: NextRequest,
    { params }: { params: Promise<{ childId: string }> },) {
    const { childId } = await params;

    const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
        parentLinks: { include: { parent: true } }, registrations: { include: { camp: true } },
    },
    });

    if (!child) return new NextResponse('Non trouvé', { status: 404 });

    const parents = (child.parentLinks ?? []).map((pl: any) => ({
        parentId: pl.parentId ?? pl.parent?.id,
        firstName: pl.parent?.firstName,
        lastName: pl.parent?.lastName,
        email: pl.parent?.email,
        phone: pl.parent?.phone,
        isPrimary: !!pl.isPrimary,
        relationship: pl.relationship ?? null,
    }));

    const pdfData = {
        child,
        parents,
        organization: { name: 'ALVM', address: '' },
    };

    const element = React.createElement(ChildProfilePDF as any, {
        data: pdfData as any,
    });

    const stream = await renderToStream(element as any);

    return new NextResponse(stream as any, {
        headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="fiche-${child.lastName}.pdf"`,
    },
});
}