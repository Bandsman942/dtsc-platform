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

## Identité visuelle RH

Les surfaces de dossier collaborateur, contrats, organisation et libre-service RH utilisent les tokens DTSC (`border-dtsc-border`, `bg-dtsc-surface`, `text-dtsc-ink`, `text-dtsc-blue`) dans les deux thèmes. Les sections dépliables restent visuellement homogènes. Les couleurs hors marque sont réservées aux statuts et alertes réels (approuvé/actif, attente, refus, archivage) ; un montant, une catégorie de section ou un département ne justifie pas un aplat coloré.

Le libre-service « Mon espace RH » est accessible uniquement par l'onglet du rail horizontal de `TIME_ATTENDANCE`, après chargement paresseux. Dans la même vue métier plein écran que les autres onglets, il regroupe bulletins, pointage et rapports. Les trois historiques possèdent des paginations indépendantes côté serveur (`page`, `clockPage`, `reportPage`, taille bornée à 5–25) et des compteurs. Le pointage actif reste visible indépendamment de la page d'historique ; les listes demeurent liées au collaborateur du compte authentifié et à l'organisation active. Aucun historique n'est tronqué à 6/8/20 éléments dans le client.

**Liaisons transversales (#1036) :** navigation interne vers « Mes bulletins », « Mon temps de travail » et « Rapports », liens vers les onglets « Horaires planifiés », « Présences », « Congés » et « Feuilles de temps » du rail quand `TIME_ATTENDANCE` est accessible, puis modules RH et paie uniquement s'ils apparaissent dans la navigation autorisée calculée côté serveur. Le hub des modules ERP et l'en-tête du workspace Paie proposent désormais des accès compacts ; les collaborateurs disposant du seul droit de lire leurs propres données peuvent ouvrir `/enterprise-modules/my-hr` en plein écran sans exiger une permission de lecture de l'ensemble du module TIME_ATTENDANCE. Ces liens sont des raccourcis, **jamais un contournement RBAC**. La route personnelle vérifie indépendamment les modules habilités ; les API d'historiques vérifient toujours l'identité et le tenant.


**Recette visuelle #1036 :** mobile 320, 360, 375, 390, 414 px, tablette 768/1024 px, FR/EN, clair/sombre, statut pointage actif/inactif, paie approuvée, rapports en attente/refusés/approuvés, navigation dossier/contrat/organisation et clavier.

## Maturité

`PROFESSIONAL_READY` après validation automatisée. La commercialisation exige les scénarios manuels, le support et le packaging.
