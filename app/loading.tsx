export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-md bg-white/10" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-32 animate-pulse rounded-lg bg-white/10" />
          <div className="h-32 animate-pulse rounded-lg bg-white/10" />
          <div className="h-32 animate-pulse rounded-lg bg-white/10" />
        </div>
        <div className="h-96 animate-pulse rounded-lg bg-white/10" />
      </div>
    </main>
  );
}
