import { ParentRecordCard } from '@/components/parent/parent-record-card';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

type Child = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  medicalInfo?: {
    allergies?: string[];
    medications?: string[];
    conditions?: string[];
    diet_restrictions?: string[];
    notes?: string;
  } | null;
};

export function ChildrenCards({ initialChildren }: { initialChildren: Child[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {initialChildren.map((child) => (
        <ParentRecordCard
          key={child.id}
          title={`${child.firstName} ${child.lastName}`}
          href={`/dashboard/parent/children/${child.id}`}
          description="Informations personnelles, santé et documents"
          actions={
            <>
              <Button asChild>
                <Link href={`/dashboard/parent/children/${child.id}`}>Voir la fiche</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/dashboard/parent/children/${child.id}/edit`}>Modifier</Link>
              </Button>
            </>
          }
        >
          <p className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
            Né(e) le {formatDate(child.birthDate)}
          </p>
          {Boolean(child.medicalInfo?.allergies?.length) && (
            <p>Allergies : {child.medicalInfo?.allergies?.join(', ')}</p>
          )}
        </ParentRecordCard>
      ))}
    </div>
  );
}
