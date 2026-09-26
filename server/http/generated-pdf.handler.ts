/**
 * PDF générés à la demande : `GET /api/generate/{attendance-list|child-profile|staff-profile}/:id`.
 *
 * Les données sont lues dans une transaction du tenant (whitelist `select`),
 * le rendu @react-pdf se fait ensuite, hors transaction.
 */
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import {
  AttendanceListPDF,
  type AttendanceListData,
  type AttendanceCell,
} from '@/lib/pdf/attendance-list-pdf';
import { ChildProfilePDF } from '@/lib/pdf/child-profile-pdf';
import { StaffProfilePDF } from '@/lib/pdf/staff-profile-pdf';
import { hasChildAccess } from '@/server/helpers/child-access.helper';
import { getPdfSettings } from '@/server/helpers/pdf-settings.helper';
import {
  openTenantRequest,
  PDF_HEADERS,
  textError,
  type RequestUser,
} from '@/server/http/tenant-request';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MedicalInfoShape = {
  allergies?: string[];
  medications?: string[];
  conditions?: string[];
  diet_restrictions?: string[];
  notes?: string;
};

async function pdfResponse(element: React.ReactElement, disposition: string): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(element as any);
  return new Response(stream as unknown as ReadableStream, {
    headers: { ...PDF_HEADERS, 'Content-Disposition': disposition },
  });
}

/** Liste de présence d'un camp — personnel et administrateurs. */
export async function handleAttendanceListPdf(
  campId: string,
  user: RequestUser | null,
): Promise<Response> {
  const tenant = await openTenantRequest(user, ['documents', 'attendances'], textError);
  if (tenant instanceof Response) return tenant;
  if (!['STAFF', 'ADMIN'].includes(tenant.user.role)) return textError('Non autorisé', 403);
  if (!UUID.test(campId)) return textError('ACM non trouvé', 404);

  const data = await tenant.run(async (db) => {
    const camp = await db.camp.findFirst({
      where: { id: campId, deletedAt: null },
      select: {
        name: true,
        location: true,
        startDate: true,
        endDate: true,
        registrations: {
          where: { status: 'CONFIRMED', deletedAt: null },
          select: {
            child: { select: { firstName: true, lastName: true } },
            attendances: { select: { attendanceDate: true, status: true } },
          },
        },
      },
    });
    return camp ? { camp, settings: await getPdfSettings(db) } : null;
  });
  if (!data) return textError('ACM non trouvé', 404);
  const { camp, settings } = data;

  // Dates du camp, bornes incluses.
  const dates: Date[] = [];
  const start = new Date(camp.startDate);
  const end = new Date(camp.endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const rows = camp.registrations.map((registration) => {
    const byDate = new Map<string, AttendanceCell>();
    for (const attendance of registration.attendances)
      byDate.set(new Date(attendance.attendanceDate).toISOString().slice(0, 10), attendance.status);
    return {
      childFirstName: registration.child.firstName,
      childLastName: registration.child.lastName,
      attendances: dates.map((d) => byDate.get(d.toISOString().slice(0, 10)) ?? null),
    };
  });

  const pdfData: AttendanceListData = {
    camp: { name: camp.name, location: camp.location, startDate: camp.startDate, endDate: camp.endDate },
    dates,
    rows,
    org: settings.org,
    generatedAt: new Date(),
    footerMention: settings.mentions.attendance || undefined,
  };
  const safeName = camp.name.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
  return pdfResponse(
    React.createElement(
      AttendanceListPDF as React.ComponentType<{ data: AttendanceListData }>,
      { data: pdfData },
    ),
    `inline; filename="presences-${safeName}.pdf"`,
  );
}

/** Fiche d'un enfant (données sensibles) — même règle d'accès que les procédures. */
export async function handleChildProfilePdf(
  childId: string,
  user: RequestUser | null,
): Promise<Response> {
  const tenant = await openTenantRequest(user, ['documents', 'children'], textError);
  if (tenant instanceof Response) return tenant;
  if (!UUID.test(childId)) return textError('Non trouvé', 404);

  const data = await tenant.run(async (db) => {
    if (!(await hasChildAccess(db, tenant.user.id, tenant.user.role, childId))) return 'forbidden';
    const child = await db.child.findFirst({
      where: { id: childId, deletedAt: null },
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
          where: { parent: { deletedAt: null } },
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
    return child ? { child, settings: await getPdfSettings(db) } : null;
  });
  if (data === 'forbidden') return textError('Non autorisé', 403);
  if (!data) return textError('Non trouvé', 404);
  const { child, settings } = data;

  const pdfData = {
    child: {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      birthDate: child.birthDate,
      gender: child.gender,
      school: child.ecole,
      medicalInfo: (child.medicalInfo ?? {}) as unknown as MedicalInfoShape,
      emergencyContactName: child.emergencyContactName,
      emergencyContactPhone: child.emergencyContactPhone,
      emergencyContactRelation: child.emergencyContactRelation,
    },
    parents: child.parentLinks.map((link) => ({
      parentId: link.parentId,
      firstName: link.parent.firstName,
      lastName: link.parent.lastName,
      email: link.parent.email,
      phone: link.parent.phone,
      homePhone: link.parent.homePhone,
      workPhone: link.parent.workPhone,
      isPrimary: link.isPrimary,
      relationship: link.relationship,
    })),
    org: settings.org,
    footerMention: settings.mentions.childProfile || undefined,
  };
  return pdfResponse(
    React.createElement(ChildProfilePDF, { data: pdfData }),
    `attachment; filename="fiche-${child.firstName}-${child.lastName}.pdf"`,
  );
}

/** Fiche d'un membre du personnel — personnel et administrateurs. */
export async function handleStaffProfilePdf(
  staffId: string,
  user: RequestUser | null,
): Promise<Response> {
  const tenant = await openTenantRequest(user, ['documents', 'staff'], textError);
  if (tenant instanceof Response) return tenant;
  if (!['STAFF', 'ADMIN'].includes(tenant.user.role)) return textError('Non autorisé', 403);
  if (!UUID.test(staffId)) return textError('Non trouvé', 404);

  const data = await tenant.run(async (db) => {
    const staffUser = await db.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        staffMember: {
          select: { userId: true, firstName: true, lastName: true, phone: true, email: true },
        },
      },
    });
    return staffUser?.staffMember
      ? { staffUser, profile: staffUser.staffMember, settings: await getPdfSettings(db) }
      : null;
  });
  if (!data) return textError('Non trouvé', 404);
  const { staffUser, profile, settings } = data;

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
        id: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        email: profile.email,
      },
    },
    org: settings.org,
    footerMention: settings.mentions.staffProfile || undefined,
  };
  return pdfResponse(
    React.createElement(StaffProfilePDF, { data: pdfData }),
    `attachment; filename="fiche-${profile.firstName}-${profile.lastName}.pdf"`,
  );
}
