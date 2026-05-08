import { AppShell } from "@/components/layout/app-shell";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatEnumLabel } from "@/lib/labels";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <section className="dtsc-panel max-w-6xl overflow-hidden p-0">
        <div className="border-b border-slate-200 bg-[#001736] p-8 text-white">
          <p className="text-sm font-semibold text-cyan-300">Compte client</p>
          <h1 className="mt-2 text-3xl font-black">Profil utilisateur</h1>
          <p className="mt-2 text-sm text-slate-300">Informations de contact, identité professionnelle et visibilité publique maîtrisée.</p>
        </div>
        <dl className="grid gap-4 border-b border-dtsc-border p-6 sm:grid-cols-2">
          <div className="px-8">
            <dt className="text-sm text-dtsc-muted">Nom</dt>
            <dd className="mt-1 font-bold text-dtsc-ink">{user.name}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-dtsc-muted">Email</dt>
            <dd className="mt-1 font-bold text-dtsc-ink">{user.email}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-dtsc-muted">Entreprise</dt>
            <dd className="mt-1 font-bold text-dtsc-ink">{user.companyName || "Non renseignée"}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-dtsc-muted">Téléphone</dt>
            <dd className="mt-1 font-bold text-dtsc-ink">{user.phone || "Non renseigné"}</dd>
          </div>
          <div className="px-8">
            <dt className="text-sm text-dtsc-muted">Rôle</dt>
            <dd className="mt-1 inline-flex rounded-full bg-[#d5e3fd] px-3 py-1 text-sm font-bold text-[#002b5b]">{formatEnumLabel(user.role)}</dd>
          </div>
          <div className="px-8 pb-8">
            <dt className="text-sm text-dtsc-muted">Inscription</dt>
            <dd className="mt-1 font-bold text-dtsc-ink">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
        <ProfileEditor user={JSON.parse(JSON.stringify(user))} />
      </section>
    </AppShell>
  );
}
