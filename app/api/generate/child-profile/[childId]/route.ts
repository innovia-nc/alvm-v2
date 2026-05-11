import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/server/db';
import { ChildProfilePDF } from '@/lib/pdf/child-profile-pdf';

export async function GET(req: NextRequest, { params }: { params: { childId: string } }) {
    const child = await prisma.child.findUnique({
        where: { id: params.childId },
        include: { parentLinks: { include: { parent: true } }, registrations: { include: { camp: true } } }
    });

    if (!child) return new NextResponse("Non trouvé", { status: 404 });

    const pdfData = {
            child: child,
            organization: { name: "ALVM", address: "" }
    };

    const element = React.createElement(ChildProfilePDF as any, { data: pdfData as any });
const stream = await renderToStream(element as any);

    return new NextResponse(stream as any, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="fiche-${child.lastName}.pdf"'}
    });
}