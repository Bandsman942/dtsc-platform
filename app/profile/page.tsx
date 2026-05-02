import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <section className="max-w-3xl rounded-lg border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-2xl font-semibold text-white">Profil utilisateur</h1>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-400">Nom</dt>
            <dd className="mt-1 text-white">{user.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Email</dt>
            <dd className="mt-1 text-white">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Entreprise</dt>
            <dd className="mt-1 text-white">{user.companyName || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Téléphone</dt>
            <dd className="mt-1 text-white">{user.phone || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Rôle</dt>
            <dd className="mt-1 text-white">{user.role}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Inscription</dt>
            <dd className="mt-1 text-white">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
