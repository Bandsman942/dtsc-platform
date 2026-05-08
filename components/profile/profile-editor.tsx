"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ProfileData = {
  name: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  jobTitle: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatarUrl: string | null;
  publicProfileConsent: boolean;
};

export function ProfileEditor({ user }: { user: ProfileData }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        publicProfileConsent: payload.publicProfileConsent === "on",
      }),
    });

    setMessage(response.ok ? "Profil mis à jour." : "Impossible de mettre à jour le profil.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function uploadAvatar() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Sélectionnez une image de profil avant l'envoi.");
      return;
    }

    setUploading(true);
    const data = new FormData();
    data.set("avatar", file);
    const response = await fetch("/api/account/avatar", {
      method: "POST",
      body: data,
    });
    const result = await response.json().catch(() => null);
    setUploading(false);
    if (!response.ok) {
      setMessage(result?.error || "Impossible d'envoyer cette photo. Vérifiez Supabase Storage.");
      return;
    }
    setAvatarUrl(result.avatarUrl);
    setMessage("Photo de profil mise à jour.");
    router.refresh();
  }

  return (
    <>
      <form onSubmit={saveProfile} className="space-y-6 p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-dtsc-border bg-dtsc-soft text-3xl font-black text-dtsc-blue">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Photo de profil" className="h-full w-full object-cover" />
                ) : (
                  user.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <p className="mt-4 text-sm font-bold text-dtsc-ink">{user.email}</p>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">PNG, JPG ou WebP. Taille maximale: 2 Mo.</p>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="mt-4 w-full text-xs text-dtsc-muted" />
              <Button type="button" onClick={uploadAvatar} disabled={uploading} className="mt-3 w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                <Upload className="h-4 w-4" />
                {uploading ? "Envoi..." : "Envoyer la photo"}
              </Button>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Nom complet
              <Input name="name" defaultValue={user.name} required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Poste
              <Input name="jobTitle" defaultValue={user.jobTitle || ""} placeholder="Ex: Responsable opérations" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Entreprise
              <Input name="companyName" defaultValue={user.companyName || ""} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Téléphone
              <Input name="phone" defaultValue={user.phone || ""} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Localisation
              <Input name="location" defaultValue={user.location || ""} placeholder="Ville, pays" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
              Site ou portfolio
              <Input name="website" defaultValue={user.website || ""} placeholder="https://..." />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink sm:col-span-2">
              Photo via URL publique
              <Input name="avatarUrl" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label className="grid gap-2 text-sm font-bold text-dtsc-ink sm:col-span-2">
              Bio professionnelle
              <textarea
                name="bio"
                defaultValue={user.bio || ""}
                placeholder="Résumé court de votre rôle, vos responsabilités et votre expertise."
                className="min-h-28 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm leading-7 text-dtsc-ink outline-none focus:border-cyan-400"
              />
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-6 text-dtsc-muted sm:col-span-2">
              <input name="publicProfileConsent" type="checkbox" defaultChecked={user.publicProfileConsent} className="mt-1 h-4 w-4 accent-cyan-500" />
              <span>
                J&apos;autorise l&apos;affichage de mon nom, de ma fonction et de ma photo sur les publications publiques DTSC dont je suis auteur.
                Cette option peut être retirée à tout moment.
              </span>
            </label>
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736] sm:col-span-2">
              <CheckCircle2 className="h-4 w-4" />
              Enregistrer le profil
            </Button>
          </section>
        </div>
      </form>

      <Dialog open={Boolean(message)} title="Profil utilisateur" onClose={() => setMessage("")}>
        <div className="flex items-start gap-3">
          <Camera className="mt-1 h-5 w-5 text-cyan-500" />
          <p className="text-sm leading-7 text-dtsc-muted">{message}</p>
        </div>
      </Dialog>
    </>
  );
}
