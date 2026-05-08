"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ProfileData = {
  id: string;
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

const avatarOutputSize = 512;
const avatarQuality = 0.86;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Compression impossible"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      avatarQuality
    );
  });
}

async function optimizeAvatarFile(file: File) {
  if (!allowedAvatarTypes.has(file.type)) {
    throw new Error("Choisissez une image PNG, JPG ou WebP.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = avatarOutputSize;
    canvas.height = avatarOutputSize;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Optimisation impossible sur cet appareil.");
    }

    const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, (image.naturalWidth - cropSize) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - cropSize) / 2);
    context.fillStyle = "#001736";
    context.fillRect(0, 0, avatarOutputSize, avatarOutputSize);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, avatarOutputSize, avatarOutputSize);

    const blob = await canvasToBlob(canvas);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "avatar"}-dtsc.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function ProfileEditor({ user }: { user: ProfileData }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageBroken, setImageBroken] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    setImageBroken(false);
  }, [previewUrl, avatarUrl]);

  async function selectAvatarFile(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    try {
      const optimized = await optimizeAvatarFile(file);
      setSelectedFile(optimized);
      setMessage(`Image optimisée: ${Math.round(optimized.size / 1024)} Ko, ${avatarOutputSize} x ${avatarOutputSize}px.`);
    } catch (error) {
      setSelectedFile(null);
      setMessage(error instanceof Error ? error.message : "Cette image ne peut pas être utilisée.");
    }
  }

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
    const file = selectedFile;
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
    setSelectedFile(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
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
                {(previewUrl || avatarUrl) && !imageBroken ? (
                  <img
                    src={previewUrl || avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => {
                      setImageBroken(true);
                      setMessage("L'image n'a pas pu être affichée. Sélectionnez une autre photo ou renvoyez-la.");
                    }}
                  />
                ) : (
                  user.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <p className="mt-4 text-sm font-bold text-dtsc-ink">{user.email}</p>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">PNG, JPG ou WebP. L&apos;image est recadrée en carré et compressée avant l&apos;envoi.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => selectAvatarFile(event.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                className="mt-4 w-full rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"
              >
                <FolderOpen className="h-4 w-4" />
                Choisir une photo
              </Button>
              {selectedFile && (
                <p className="mt-2 max-w-full truncate rounded-lg bg-dtsc-soft px-3 py-2 text-xs font-bold text-dtsc-blue" title={selectedFile.name}>
                  {selectedFile.name}
                </p>
              )}
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
