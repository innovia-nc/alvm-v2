'use client';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { RegistrationCancellationDialog } from '@/components/admin/registrations/registration-cancellation-dialog';
interface Props {
  registrationId: string;
  childName: string;
  campName: string;
  hasInvoice: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
export function CancelRegistrationDialog({
  registrationId,
  childName,
  campName,
  open,
  onOpenChange,
}: Props) {
  const utils = trpc.useUtils();
  const router = useRouter();
  return (
    <RegistrationCancellationDialog
      registration={{
        id: registrationId,
        child: { firstName: childName, lastName: '' },
        camp: { name: campName },
      }}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={() => {
        utils.registrations.list.invalidate();
        utils.invoices.list.invalidate();
        router.refresh();
        onOpenChange(false);
      }}
    />
  );
}
