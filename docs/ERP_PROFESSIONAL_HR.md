# ERP professionnel — Ressources humaines

## Périmètre

Module canonique : `HUMAN_RESOURCES`.

Le dossier collaborateur regroupe identité, coordonnées, relation DTSC, emploi, poste, département, contrat, rémunération autorisée, documents, congés, temps et historique.

## Identité relationnelle

- Un collaborateur peut être créé manuellement sans compte DTSC.
- Une invitation peut cibler un compte existant ou inviter à créer un compte.
- L’utilisateur peut demander lui-même à rejoindre l’entreprise.
- La liaison exige un consentement explicite.
- Une révocation retire les accès dérivés sans supprimer le dossier RH.
- Salaire, sanctions, données bancaires, documents confidentiels et données médicales ne sont jamais synchronisés vers le compte global.

## Contrats

Le contrat gère type, dates, période d’essai, poste, département, site, rémunération, devise, fréquence, temps standard, conditions et approbateur.

La création produit une version soumise à validation. Les renouvellements ou changements ne doivent pas écraser silencieusement l’historique.

## Confidentialité

- Les informations de rémunération sont limitées aux permissions RH sensibles.
- Un manager ne devient pas automatiquement administrateur RH.
- Les documents et historiques de paie sont isolés par entreprise et collaborateur.
- Les journaux techniques n’enregistrent pas le salaire complet ni les documents.

## Organigramme

La vue mobile regroupe les collaborateurs par département. Les postes, responsables et lignes hiérarchiques restent issus des référentiels de l’entreprise, jamais d’un texte libre technique.

## Maturité

`PROFESSIONAL_READY` après validation automatisée. La commercialisation exige les scénarios manuels, le support et le packaging.
