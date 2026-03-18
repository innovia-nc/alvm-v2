'use client';

import { Badge } from '@/components/ui/badge';
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

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface ChildAttendance {
  registrationId: string;
  childId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus | null;
}

interface AttendanceGridProps {
  children: ChildAttendance[];
  onMarkAttendance: (
    registrationId: string,
    status: AttendanceStatus,
    notes?: string
  ) => void;
  isPending: boolean;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; className: string }> = {
  PRESENT: {
    label: 'Pr\u00e9sent',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  ABSENT: {
    label: 'Absent',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  LATE: {
    label: 'En retard',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  EXCUSED: {
    label: 'Excus\u00e9',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

export function AttendanceGrid({
  children,
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
          {children.map((child) => (
            <TableRow key={child.registrationId}>
              <TableCell>
                <div className="font-medium">
                  {child.lastName} {child.firstName}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {child.status ? (
                    <Badge
                      variant="outline"
                      className={STATUS_CONFIG[child.status].className}
                    >
                      {STATUS_CONFIG[child.status].label}
                    </Badge>
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
                      <SelectValue placeholder="\u2014 Choisir \u2014" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
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
