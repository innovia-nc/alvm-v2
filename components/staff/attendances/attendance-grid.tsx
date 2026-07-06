'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface ChildAttendance {
  registrationId: string;
  childId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus | null;
}

interface AttendanceGridProps {
  attendees: ChildAttendance[];
  onMarkAttendance: (
    registrationId: string,
    status: AttendanceStatus,
    notes?: string
  ) => void;
  isPending: boolean;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  LATE: 'En retard',
  EXCUSED: 'Excusé',
};

export function AttendanceGrid({
  attendees,
  onMarkAttendance,
  isPending,
}: AttendanceGridProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">Enfant</TableHead>
            <TableHead className="w-[180px]">Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attendees.map((child) => (
            <TableRow key={child.registrationId}>
              <TableCell>
                <div className="font-medium">
                  {child.lastName} {child.firstName}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {child.status ? (
                    <StatusBadge type="attendance" status={child.status} />
                  ) : null}
                  <Select
                    value={child.status ?? ''}
                    onValueChange={(value) =>
                      onMarkAttendance(
                        child.registrationId,
                        value as AttendanceStatus
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="— Choisir —" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {STATUS_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
