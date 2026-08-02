# Maturité commerciale ERP — DTSC Platform

Version : 4
Évaluation courante : 2 août 2026

## Sources exécutables

- Registre canonique : `lib/enterprise/module-registry*.json` et `module-registry.ts`.
- Évaluation produit de base : `lib/enterprise/module-commercial-readiness.json`.
- Complément itération 3 : `lib/enterprise/module-commercial-readiness-iteration-03.json`.
- Résolution typée fusionnée : `lib/enterprise/module-commercial-readiness.ts`.
- Contrôle CI : `scripts/qa-erp-commercial-readiness-checks.mjs` et `scripts/qa-erp-professional-iteration-03-checks.mjs`.
- Visualisation autorisée : `/admin/erp-readiness`.

La matrice affichée dans l’administration est calculée à partir de ces sources. Ce document explique la politique ; il ne remplace pas le manifeste exécutable.

## Lecture de la matrice

Pour chaque module, l’administration expose :

- le libellé commercial français ;
- le code technique en information secondaire ;
- le statut technique ;
- la maturité commerciale ;
- la route et le workspace lorsqu’ils existent ;
- le plan minimal ;
- les dépendances ;
- les critères validés et manquants ;
- le contrat QA ;
- les preuves ;
- l’itération suivante ;
- la date d’évaluation ;
- la commercialisabilité.

## Politique prudente

Aucune promotion automatique vers `COMMERCIAL_READY` n’est autorisée.

Les modules sans preuve produit dédiée reçoivent une évaluation conservatrice. Les modules masqués, planifiés ou retirés restent `BACKEND_READY`. Une section d’administration consolidée peut être `PROFESSIONAL_READY` sans être vendue comme module autonome.

`COMMERCIAL_READY` exige simultanément :

- un parcours métier complet ;
- des formulaires, détails et actions réellement accessibles aux rôles autorisés ;
- des workflows de soumission, validation, correction et refus reliés au validateur assigné ;
- du français commercial et une internationalisation maîtrisée ;
- une expérience mobile sans chevauchement ni mot cassé ;
- des rails et filtres tactiles fonctionnels ;
- des permissions serveur, l’isolation tenant et un audit ;
- une documentation et un guide dédié ;
- l’observabilité et des QA opposables ;
- un packaging commercial ;
- une décision explicite du propriétaire fondée sur sa validation fonctionnelle et la fermeture des défauts remontés.

Les tests automatisés verts ne remplacent jamais une campagne E2E authentifiée. Inversement, une campagne manuelle ne permet pas de masquer un Quality Gate en échec.

## Réévaluation de l’itération 2

Les modules ciblés disposent de workspaces dédiés, formulaires, détails, actions, onboarding, aide, documentation, mobile et QA ciblée. Leur promotion finale reste individuelle et dépend des contrôles CI, des scénarios navigateur authentifiés et des smoke tests Production.

## Réévaluation et promotion de l’itération 3

Le propriétaire a exécuté une campagne manuelle initiale en Production. Cette campagne a confirmé les chaînes métier principales, mais a également révélé des défauts transversaux : rails tactiles bloqués, filtres chevauchés, lignes mobiles trop étroites, formulaires difficiles à découvrir, workflow du validateur de contrat incomplet, documents contractuels sans téléversement guidé, guides non contextualisés, Support non surligné et messages vocaux insuffisamment robustes.

La PR de durcissement commercial ferme ces défauts et ajoute des contrôles CI spécifiques. Sur décision explicite du propriétaire, les modules suivants sont désormais évalués `COMMERCIAL_READY` et `commercializable: true` :

| Module | Preuves principales | Frontières conservées |
|---|---|---|
| Ventes, devis et commandes | Formulaire de devis, calcul serveur, conversion, reliquats, livraisons idempotentes, rail tactile et guide | Commande distincte de facture et paiement |
| Fournisseurs, achats et réceptions | Fournisseurs, demandes, approbations, commandes, réceptions partielles, documents | Réception distincte de dette et paiement |
| Stock, transferts et inventaires | Soldes, transferts, inventaires, ajustements, approbation et protection du stock négatif | Aucun mouvement silencieux ou destructif |
| Ressources humaines | Dossier sans compte, consentement, contrats, organigramme, formulaires visibles | Fiche RH distincte du compte DTSC |
| Temps et présences | Congés, chevauchements, feuilles de temps, approbation et correction | Disponibilité, absence, temps approuvé et paie distincts |
| Paie opérationnelle | Périodes, population, calcul serveur, approbation, bulletins privés, recréation après annulation | Paie distincte du paiement financier |
| Projets et services | Projet, équipe, jalons, risques, détail et permissions | Accès client uniquement explicite et révocable |
| Temps projet et livrables | Temps lié au projet, soumission, correction, révision et validation assignée | Temps, facturation et paie distincts |
| Actifs et maintenance | Registre, affectation, retour, incidents, maintenance et historique | Actif opérationnel distinct de l’immobilisation comptable |

Les preuves transversales de cette promotion comprennent :

- `components/enterprise/professional/professional-erp-ui.tsx` ;
- `components/workspace/module-workspace.tsx` ;
- `components/workspace/business-list.tsx` ;
- `app/mobile-stability.css` ;
- `app/help/enterprise/page.tsx` ;
- le workflow contractuel assigné et ses commentaires CRUD ;
- le téléversement réel des documents liés ;
- la capture microphone robuste et les accusés de messagerie ;
- `scripts/qa-erp-professional-iteration-03-checks.mjs`.

La promotion commerciale n’affirme pas qu’une nouvelle campagne manuelle post-correctif a déjà été exécutée. Le plan de smoke tests post-déploiement reste conservé dans `docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_03.md` et doit recevoir des résultats réels du propriétaire.

## Anomalies bloquantes

Le contrôle CI échoue notamment si :

- un module commercialisable utilise une interface générique ou non vérifiée ;
- un module `COMMERCIAL_READY` n’a pas d’override explicite ;
- la route ou le workspace manque ;
- une écriture existe sans formulaire prouvé ;
- le détail ou les actions métier manquent ;
- les permissions, l’audit, l’i18n, le responsive ou la QA manquent ;
- un rail tactile ne dispose plus de son contrat de défilement ;
- une ligne métier peut de nouveau réduire son titre à une colonne illisible ;
- un validateur assigné ne peut plus décider l’objet soumis ;
- un commentaire de workflow devient modifiable par un autre auteur ;
- un document lié ne peut plus recevoir un fichier privé versionné ;
- un guide pointe vers un module différent ;
- le microphone échoue sans message actionnable ;
- les accusés de messagerie ne distinguent plus envoi, réception et lecture ;
- des critères restent ouverts ;
- une preuve déclarée est introuvable ;
- un override cible un code absent du registre ;
- un module de l’itération 3 repasse silencieusement par le workspace générique ;
- un rapport déclare les tests E2E post-correctif réussis sans preuve du propriétaire.

## Maintenance

Toute itération de professionnalisation doit :

1. fermer uniquement les critères réellement traités ;
2. ajouter les preuves correspondantes ;
3. laisser visibles les lacunes restantes ;
4. exécuter les QA du domaine et le contrôle de maturité ;
5. faire relire la promotion par produit et technique ;
6. déclasser immédiatement un module lorsqu’une preuve majeure n’est plus vraie.

Le statut `ACTIVE` demeure un statut technique. Il ne doit jamais être réutilisé comme argument commercial.
