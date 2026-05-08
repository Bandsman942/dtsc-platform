"use client";

import { useState } from "react";
import { Mail, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ContactNewsletterSection({ contactEmail }: { contactEmail: string }) {
  const [contactMessage, setContactMessage] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const [isContactPending, setIsContactPending] = useState(false);
  const [isNewsletterPending, setIsNewsletterPending] = useState(false);

  async function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsContactPending(true);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/public/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, source: "landing-contact" }),
    });
    setIsContactPending(false);
    if (response.ok) {
      setContactMessage("Votre message a été transmis à DTSC. Notre équipe reviendra vers vous après qualification.");
      form.reset();
    } else {
      setContactMessage(`Impossible de transmettre le message pour le moment. Vous pouvez écrire directement à ${contactEmail}.`);
    }
  }

  async function submitNewsletter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsNewsletterPending(true);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, consent: payload.consent === "on" }),
    });
    setIsNewsletterPending(false);
    if (response.ok) {
      setNewsletterMessage("Inscription enregistrée. Vous recevrez les contenus DTSC liés à la data, l'IA et la transformation numérique.");
      form.reset();
    } else {
      setNewsletterMessage("Impossible d'enregistrer cette inscription. Vérifiez les informations saisies puis réessayez.");
    }
  }

  return (
    <section id="contact" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-[1.5rem] border border-dtsc-border bg-[#001736] p-6 text-white shadow-[0_24px_80px_rgba(0,23,54,0.2)] sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-black text-cyan-200">
            <Mail className="h-4 w-4" />
            Contact professionnel DTSC
          </p>
          <h2 className="mt-5 text-3xl font-black">Parlez-nous de votre besoin numérique, data ou IA.</h2>
          <p className="mt-4 max-w-2xl leading-7 text-slate-300">
            Les demandes issues du site sont transmises à l&apos;équipe DTSC pour qualification. Le chatbot peut aussi vous aider à structurer le contenu du message avant envoi.
          </p>
          <a href={`mailto:${contactEmail}`} className="mt-5 inline-flex font-black text-cyan-200 underline underline-offset-4 hover:text-white">
            {contactEmail}
          </a>
          <form onSubmit={submitContact} className="mt-8 grid gap-3 md:grid-cols-2">
            <Input name="name" placeholder="Nom complet" required className="bg-white/10 text-white placeholder:text-slate-300" />
            <Input name="email" type="email" placeholder="Email professionnel" required className="bg-white/10 text-white placeholder:text-slate-300" />
            <Input name="phone" placeholder="Téléphone" className="bg-white/10 text-white placeholder:text-slate-300" />
            <Input name="companyName" placeholder="Entreprise" className="bg-white/10 text-white placeholder:text-slate-300" />
            <Input name="subject" placeholder="Objet de la demande" required className="bg-white/10 text-white placeholder:text-slate-300 md:col-span-2" />
            <textarea
              name="message"
              placeholder="Décrivez votre contexte, vos objectifs et les contraintes connues."
              className="min-h-36 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-300 focus-visible:ring-2 focus-visible:ring-cyan-300 md:col-span-2"
              required
            />
            <Button disabled={isContactPending} className="rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300 md:col-span-2">
              <Send className="h-4 w-4" />
              {isContactPending ? "Transmission..." : "Envoyer à DTSC"}
            </Button>
          </form>
        </div>

        <div className="dtsc-card-alt p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-dtsc-soft px-3 py-1.5 text-sm font-black text-dtsc-blue">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            Newsletter DTSC
          </p>
          <h2 className="mt-5 text-2xl font-black text-dtsc-ink">Recevoir les analyses DTSC.</h2>
          <p className="mt-3 leading-7 text-dtsc-muted">
            Inscrivez-vous pour recevoir des contenus utiles sur la data, les KPI, l&apos;IA en entreprise, l&apos;automatisation et la transformation numérique.
          </p>
          <form onSubmit={submitNewsletter} className="mt-6 space-y-3">
            <Input name="name" placeholder="Nom complet" required />
            <Input name="email" type="email" placeholder="Email professionnel" required />
            <Input name="companyName" placeholder="Entreprise" />
            <Input name="interest" placeholder="Sujet d'intérêt: BI, IA, automatisation..." />
            <label className="flex items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm leading-6 text-dtsc-muted">
              <input name="consent" type="checkbox" required className="mt-1 h-4 w-4 accent-cyan-500" />
              <span>J&apos;accepte de recevoir les communications professionnelles DTSC et je peux demander mon retrait à tout moment.</span>
            </label>
            <Button disabled={isNewsletterPending} className="w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              {isNewsletterPending ? "Inscription..." : "S'abonner à la newsletter"}
            </Button>
          </form>
        </div>
      </div>
      <Dialog open={Boolean(contactMessage)} title="Contact DTSC" onClose={() => setContactMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{contactMessage}</p>
      </Dialog>
      <Dialog open={Boolean(newsletterMessage)} title="Newsletter DTSC" onClose={() => setNewsletterMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{newsletterMessage}</p>
      </Dialog>
    </section>
  );
}
