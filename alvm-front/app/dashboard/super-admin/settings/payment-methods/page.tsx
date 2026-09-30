import { redirect } from 'next/navigation';
export default function EnterpriseSettingsUnavailable() {
  redirect('/dashboard/super-admin/settings');
}
