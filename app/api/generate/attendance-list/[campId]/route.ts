import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '@/server/db';
import { auth } from '@/lib/auth';
import {
  AttendanceListPDF,
  type AttendanceListData,
  type AttendanceCell,
} from '@/lib/pdf/attendance-list-pdf';
import { getPdfSettings } from '@/server/helpers/pdf-settings.helper';

// La génération PDF (@react-pdf/renderer) peut dépasser le timeout serverless par défaut.
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ campId: string }> },
) {
  const { campId } = await params;

  // AuthN + AuthZ : staff / admin uniquement
  const session = await auth();
  if (!session?.user) {
    return new NextResponse('Non authentifié', { status: 401 });
  }
  if (session.user.role !== 'STAFF' && session.user.role !== 'ADMIN') {
    return new NextResponse('Non autorisé', { status: 403 });
  }

  // Camp + inscriptions + enfant + présences (select whitelist)
  const camp = await prisma.camp.findFirst({
    where: { id: campId, deletedAt: null },
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
      endDate: true,
      registrations: {
        where: { status: 'CONFIRMED', deletedAt: null },
        select: {
          id: true,
          child: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          attendances: {
            select: {
              attendanceDate: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!camp) {
    return new NextResponse('ACM non trouvé', { status: 404 });
  }

  // Construire les dates entre startDate et endDate (inclus)
  const dates: Date[] = [];
  if (camp.startDate && camp.endDate) {
    const start = new Date(camp.startDate);
    const end = new Date(camp.endDate);
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor.getTime() <= last.getTime()) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Index présences par registration pour alignement rapide
  const rows = camp.registrations.map((reg) => {
    const byDate = new Map<string, AttendanceCell>();
    for (const att of reg.attendances) {
      const key = new Date(att.attendanceDate).toISOString().slice(0, 10);
      byDate.set(key, att.status);
    }
    const attendances: AttendanceCell[] = dates.map((d) => {
      const key = d.toISOString().slice(0, 10);
      return byDate.get(key) ?? null;
    });
    return {
      childFirstName: reg.child.firstName,
      childLastName: reg.child.lastName,
      attendances,
    };
  });

  const settings = await getPdfSettings(prisma);

  const data: AttendanceListData = {
    camp: {
      name: camp.name,
      location: camp.location,
      startDate: camp.startDate,
      endDate: camp.endDate,
    },
    dates,
    rows,
    org: settings.org,
    generatedAt: new Date(),
    footerMention: settings.mentions.attendance || undefined,
  };

  const element = React.createElement(AttendanceListPDF as React.ComponentType<{ data: AttendanceListData }>, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(element as any);

  const safeName = camp.name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="presences-${safeName}.pdf"`,
    },
  });
}
