export type PublicLink = {
  href: string;
  label: string;
  sectionId?: string;
};

export const publicLinks: PublicLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/#services", label: "Services", sectionId: "services" },
  { href: "/#solutions", label: "Solutions", sectionId: "solutions" },
  { href: "/#secteurs", label: "Secteurs", sectionId: "secteurs" },
  { href: "/#projets", label: "Projets", sectionId: "projets" },
  { href: "/#ressources", label: "Ressources", sectionId: "ressources" },
  { href: "/#a-propos", label: "À propos", sectionId: "a-propos" },
  { href: "/#contact", label: "Contact", sectionId: "contact" },
];
