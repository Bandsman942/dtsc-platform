export type PublicLink = {
  href: string;
  label: string;
  sectionId?: string;
};

export const publicLinks: PublicLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/services", label: "Services" },
  { href: "/solutions", label: "Solutions" },
  { href: "/secteurs", label: "Secteurs" },
  { href: "/projets", label: "Projets" },
  { href: "/ressources", label: "Ressources" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
];
