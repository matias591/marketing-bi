export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-(--color-bg) p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-base font-semibold tracking-tight">Marketing BI</div>
          <p className="mt-1 text-xs text-(--color-text-muted)">
            Salesforce attribution for the team
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
