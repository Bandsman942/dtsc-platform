import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <section className="dtsc-panel max-w-4xl overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-[#001736] p-8 text-white">
          <p className="text-sm font-semibold text-cyan-300">Compte client</p>
          <h1 className="mt-2 text-3xl font-bold">Profil utilisateur</h1>
          <p className="mt-2 text-sm text-slate-300">Informations de contact et identité professionnelle.</p>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="px-8">
            <dt className="text-sm text-slate-400">Nom</dt>
            <dd className="mt-1 font-semibold text-[#001736]">{user.name}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-slate-400">Email</dt>
            <dd className="mt-1 font-semibold text-[#001736]">{user.email}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-slate-400">Entreprise</dt>
            <dd className="mt-1 font-semibold text-[#001736]">{user.companyName || "Non renseignée"}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-slate-400">Téléphone</dt>
            <dd className="mt-1 font-semibold text-[#001736]">{user.phone || "Non renseigné"}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-slate-400">Rôle</dt>
            <dd className="mt-1 inline-flex rounded-full bg-[#d5e3fd] px-3 py-1 text-sm font-bold text-[#002b5b]">{user.role}</dd>
          </div>
          <div className="px-8 pb-8">
            <dt className="text-sm text-slate-400">Inscription</dt>
            <dd className="mt-1 font-semibold text-[#001736]">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
