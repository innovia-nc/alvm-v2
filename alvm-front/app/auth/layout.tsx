import {
  ApplicationName,
  ApplicationDescription,
  SupportLink,
} from '@/components/providers/branding-provider';
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/60 px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-3xl font-bold tracking-tight text-primary">
          <ApplicationName />
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <ApplicationDescription />
        </p>
      </div>
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        <SupportLink />
      </p>
    </main>
  );
}
