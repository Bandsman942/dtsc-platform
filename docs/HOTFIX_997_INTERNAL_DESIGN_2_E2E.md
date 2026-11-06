# Hotfix #997 — Console interne Design 2.0

## Périmètre

Une composition commune aux six directions **CEO, COO, SCO, HR & CFO, CTO, MPO** remplace l’empilement de grands panneaux :

1. **Département** : en-tête compact, navigation des directions, rail de domaines, recherche et pagination des sous-sections.
2. **Sous-section** : vue plein écran avec retour, titre contextuel, contenu opérationnel ou spécialisé existant.
3. **Registre opérationnel** : navigation paginée des registres, puis liste paginée de 12 enregistrements avec recherche multi-champs insensible aux accents, période de création et rail des statuts.
4. **Fiche** : ouverture plein écran sur chaque ligne (aussi accessible via `…`), champs métier, dates, montant par devise, notes, document et tâches opérationnelles quand applicables. Édition, téléchargement et suppression respectent les droits déjà fournis par le serveur et l’interface.

Les validations CEO/COO, la paie HR & CFO, les factures, les contrôles de trésorerie et la synthèse CEO suivent aussi ce parcours avec listes compactes, filtres pertinents et fiches en plein écran. Les confirmations de décisions restent dans les dialogues de sécurité existants.

## Frontières préservées

- Aucun changement de schéma, migration, route API ou délégation d’autorité.
- Les permissions sont toujours validées dans les endpoints existants. Un bouton absent de l’UI ne constitue jamais un contrôle de sécurité serveur.
- Les chiffres de trésorerie restent séparés par devise ; les comptes signalés ne deviennent pas certifiés à cause d’un changement d’interface.
- **Pagination côté navigateur des jeux de données autorisés déjà chargés** : ce hotfix n’étend pas la limite de récupération des endpoints. L’affichage d’une page n’est pas une preuve d’exhaustivité historique ; toute pagination serveur complète nécessite un chantier API distinct.
- Les libellés des nouvelles navigations de département et du bouton retour plein écran sont FR/EN ; certains libellés spécialisés préexistants et de nouveaux filtres du registre commun restent en français. **Dette de localisation suivie dans l'Issue #998**, sans perturber les traductions déjà en place.

## Matrice OWNER_E2E (à exécuter après mise à disposition de la PR)

| Cas | Contrôle attendu | Preuve |
|---|---|---|
| CEO | Ouvrir synthèse / validations / opérations ; drill-down indicateur, statut, période et décision de paie autorisée | `NOT_EXECUTED` |
| COO | Valider prestation et paie ; rail de statuts, pagination, fiche et confirmation | `NOT_EXECUTED` |
| SCO | Registres fournisseurs / achats / stocks ; recherche multi-champs, détail, action `…` | `NOT_EXECUTED` |
| HR & CFO | Paie, factures, comptes, écritures ; devise distincte, alerte rapprochement, autorisation lecture factures | `NOT_EXECUTED` |
| CTO | Registres projets / incidents, détail, fichiers et droits d’écriture | `NOT_EXECUTED` |
| MPO | Registres projets / jalons, détail, statut et droits d’écriture | `NOT_EXECUTED` |
| Clavier | Entrée dans chaque plein écran, Tab circulaire, Échap ferme le niveau supérieur, focus rendu à l’élément initiateur | `NOT_EXECUTED` |
| Mobile | Largeurs 320, 360, 375, 390, 414, 768 et 1024 px ; mode clair/sombre, langue FR/EN, pas de scroll horizontal | `NOT_EXECUTED` |
| Sécurité | Utilisateur en lecture seule : fiche autorisée, aucune mutation ; utilisateur hors périmètre : accès rejeté côté API | `NOT_EXECUTED` |

## Vérifications automatisées

`node scripts/qa-console-internal-workspaces.mjs` vérifie le parcours commun et les sept sous-parcours spécialisés. `node scripts/qa-workspace-generalization-checks.mjs` garde les garanties API, les listes et les menus contextuels. Les contrats responsive restent dans `qa:responsive-ui`.

Ne fusionner qu’après CI et preuve OWNER_E2E distincte ; ne déclencher aucun Preview Vercel depuis cette branche.
