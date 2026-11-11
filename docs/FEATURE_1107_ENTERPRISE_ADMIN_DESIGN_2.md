# #1107 — Administration entreprise Design 2.0, quatre lots

Statut : **candidat v1.10.0**, en attente de CI et de l’**E2E final propriétaire**. Ne pas fusionner ni déployer avant validation explicite. Production Vercel exclusivement depuis `main`.

## Périmètre et source de vérité

- Les 11 sections restent rattachées à `/enterprise-admin` : vue d’ensemble, collaborateurs, postes, départements, rôles/permissions, modules, abonnement, paramètres, sécurité, audit et actions en cours.
- Cette surface admin n’écrit ni comptabilité, ni caisse, ni données de stock, ni référentiel RETAIL propriétaire. Les opérations métiers et affectations par boutique restent dans leurs modules ERP canoniques ; l’administration renvoie vers les modules autorisés.
- Les permissions sont vérifiées côté serveur par organisation, module, entitlement et action. Un rôle global DTSC n’est pas un passe-droit client ; les rôles système et le dernier administrateur critique sont protégés.

## Lot 1 — Exactitude, sécurité et parcours de sauvegarde

1. `GET /api/enterprise/:organizationId/members` charge les membres par pages de 10 à 100, avec recherche de nom/email/poste/rôle, filtres `ACTIVE`, `INVITED`, `SUSPENDED`, totaux complets et isolation `organizationId`/`removedAt:null`.
2. Une personne suspendue est accessible dans le filtre « Suspendus » afin que son bouton « Réactiver » soit atteignable ; l’API PATCH et son historique existants restent l’autorité.
3. Les compteurs collaborateurs, demandes, tâches et tâches en retard reposent sur `count/groupBy` tenant-scoped, indépendamment des listes récentes de 80 lignes. Les réunions « aujourd’hui » utilisent le fuseau de l’entreprise.
4. Le formulaire de modification d’un collaborateur ne se ferme qu’après confirmation serveur. Un refus de rôle privilégié, d’état d’invitation ou de dernière administration garde les données saisies et affiche un message.
5. Le deep-link `?section=pending` ouvre la bonne section, sans renvoyer silencieusement vers la vue générale.
6. L’export du journal d’audit avec politique d’approbation utilise un `EnterpriseRequest` de type `AUDIT_EXPORT` et l’`EnterpriseApproval` commun associé. La décision est prise dans **Validations** ; la vérification porte sur le même demandeur, la même entreprise, un statut `APPROVED` et un délai maximum de 48 h. Contrôles aux trois étapes : demande, worker d’export volumineux, téléchargement. Le téléchargement d’un job reste réservé à son créateur. Aucun nouveau modèle « AuditExport » ou contournement du moteur n’est ajouté.

## Lot 2 — Interface Design 2.0

- Barre de navigation compacte et persistante, sélection de section mobile, rail horizontal desktop, navigation profonde et sections en plein écran existantes.
- Checklist initialement repliée, pour éviter le mur de cartes sur mobile ; pourcentage calculé sur les contrôles réels.
- Barre intelligente et réutilisable : recherche avec effacement, rail de statuts scrollable, nombres, pagination avec contrôles tactiles, états vides/chargement/erreur.
- Vue d’ensemble : alertes de configuration/sécurité colorées, accès direct aux actions, barres de consommation utilisateurs/modules, indicateurs détaillés repliables. Les dépassements sont signalés ; « illimité » n’est pas assimilé à une limite nulle.
- Formulaires et actions guidés : confirmation des suppressions et suspensions, édition des rôles personnalisés, poste et département en détail, fermeture seulement après réponse positive. Les contraintes de permissions côté serveur restent inchangées.

## Lot 3 — Sections et sous-sections

| Section | Éléments Design 2.0 / contrôle | Source |
|---|---|---|
| Vue d’ensemble | KPIs exacts, alertes, quotas, navigation priorités | loader administration |
| Collaborateurs | Recherche serveur, statuts dont suspendus, pagination, formulaire, export complet borné | `OrganizationMember` |
| Postes | Recherche, statut/clé, pagination, export, édition guidée, rechargement admin conforme au contrat RH existant | `EnterprisePosition` |
| Départements | Recherche, statut, pagination, export, détail plein écran, hiérarchie | `EnterpriseDepartment` |
| Rôles/permissions | Registre filtré, simulation et affectations existantes, édition labels/statuts, export | `EnterpriseOrganizationRole` |
| Modules | Recherche, actif/inactif, pagination, export, détail/access et restrictions existants | registre canonique + modules client |
| Abonnement | plan/statut, vrais plafonds et quotas ; aucun tarif client inventé | entitlement SaaS |
| Paramètres | informations/branding existants, choix de fuseau IANA complet | organisation |
| Sécurité | politique d’invitation, MFA et export sensible dans formulaire existant | politique sécurité org |
| Audit | filtres serveur action/risque/dates UTC, pagination, rapports de page et CSV sécurisé intégral | `AuditLog` |
| Actions en cours | Recherche, statuts, échéances, pagination, export des éléments récents chargés, deep-links ERP | tâches/demandes/validations Core v2 |

Les exports **Excel, CSV et PDF** réutilisent les générateurs professionnels partagés. Pour les registres complets en mémoire, les filtres sont appliqués à toutes les lignes, indépendamment de la page. L’annuaire charge toutes les pages correspondantes jusqu’à **5 000** membres ; au-delà, l’utilisateur doit réduire la recherche. L’audit Excel/PDF désigne explicitement **la page affichée** et ne prétend pas exporter le journal complet ; le CSV d’audit reste la voie complète/volumineuse et soumise aux approbations. Les « actions en cours » restent un **extrait récent** : pour l’historique exhaustif, ouvrir les modules ERP source.

## Lot 4 — Rapports, synchronisation ERP, sûreté et compatibilité

- `POST /api/enterprise/:organizationId/administration/report` enregistre un snapshot `ENTERPRISE_ADMIN_OVERVIEW` dans `EnterpriseReport`, avec provenance `ENTERPRISE_ADMIN_DASHBOARD_V1`, instant de génération, événements opérationnels et audit. La route exige **gouvernance admin + droit `REPORTS.submit` + même origine + limite de débit**.
- Le rapport est basé exclusivement sur les indicateurs calculés côté serveur. La visionneuse professionnelle du module **Rapports** comprend son schéma `enterprise-admin-overview/v1` et fournit les trois exports. Aucun double-write métier ni montant financier approximatif n’est introduit.
- Les détails de collaborateurs/postes/départements restent des projections du référentiel commun ; les permissions ne sont pas dupliquées côté UI. Les droits de boutique RETAIL restent gérés dans les affectations par site dédiées.
- Aucun changement Prisma, aucune migration, aucune nouvelle variable d’environnement, aucune preview Vercel, aucun déclenchement de Production depuis la branche.

## E2E final à exécuter par le propriétaire

Préparer une entreprise `SHOP BCN MULTI TEST` contenant deux boutiques, deux administrateurs habilités, au moins 3 rôles, 3 départements, des postes actifs/inactifs, des invitations en cours et au moins un membre suspendu. Si possible, utiliser des volumes **supérieurs à 80 tâches/demandes** et **supérieurs à 200 collaborateurs** pour prouver l’absence de troncature des indicateurs et de l’annuaire. Ne pas manipuler de données personnelles réelles pour ce jeu de test.

| # | Recette | Résultat attendu |
|---|---|---|
| 01 | Android et desktop : ouvrir les 11 sections, scroller, revenir | Aucune section masquée ; navigation mobile exploitable, zone utile lisible |
| 02 | Ouvrir un `?section=pending` directement | Le panneau actions en cours s’ouvre |
| 03 | Filtrer un collaborateur suspendu, cliquer « Réactiver » | Confirmation et retour à « Actifs » ; journal d’audit disponible |
| 04 | Chercher un membre au-delà du premier lot initial | Résultat via API paginée, sans faux « absent » |
| 05 | Rôle privilégié : tenter une modification interdite | Refus contextualisé ; formulaire reste ouvert et saisie intacte |
| 06 | Essayer de retirer le dernier administrateur | Refus `LAST_ADMIN_PROTECTED`, aucune perte d’accès |
| 07 | Ajouter une invitation valide puis invalide | Succès ferme le formulaire ; erreur garde le formulaire et ses champs |
| 08 | Rechercher/filtrer les postes et les départements ; exporter Excel/CSV/PDF | Même périmètre filtré dans les trois fichiers, présentation professionnelle |
| 09 | Modifier poste, département, rôle personnalisé ; vérifier le contexte | Nouveau libellé/statut dans l’administration et modules dépendants ; aucun changement de droits implicite |
| 10 | Tenter de modifier les permissions protégées d’un rôle système | Blocage serveur ; aucun droit sensible accordé |
| 11 | Changer de fuseau horaire en IANA (ex. `Africa/Lubumbashi`) | Valeur enregistrée ; KPI réunions aujourd’hui cohérent |
| 12 | Activer/désactiver module autorisé vs non autorisé par plan | Succès avec dépendances ; refus lisible sans exposition de module fantôme |
| 13 | Comparer 85 tâches et 85 demandes avec les KPIs | Les totaux reflètent **toutes** les lignes, pas 80 |
| 14 | Filtrer audit par mot-clé, risque, dates, pagination | Seulement les événements de l’entreprise active ; aucun 500 sur date invalide |
| 15 | Export d’audit sans approbation requise (petit/volumineux) | CSV téléchargeable ou job durable avec statut, expiration et téléchargement |
| 16 | Activer `sensitiveExportApproval`, demander validation puis la refuser | Export refusé, aucune fuite de CSV |
| 17 | Demander une nouvelle validation, approbation par validateur désigné | Export admis pour le demandeur, dans les 48 h ; audit des actions |
| 18 | Autre utilisateur / autre entreprise : URL de job ou approval ID | 403/404, aucun téléchargement inter-tenant ou inter-utilisateur |
| 19 | Enregistrer snapshot Administration dans Rapports | `EnterpriseReport` daté visible, PDF/Excel/CSV disponibles, indicateurs identiques |
| 20 | Exporter collaborateurs (filtre, statut, pagination), comparer totaux | Toutes les lignes filtrées ≤5 000, sans duplication ; aucune autre entreprise |
| 21 | Voir les opérations RETAIL/boutiques, droits, Rapports | Aucun nouveau double-write ; navigation vers les modules canoniques respectée |
| 22 | Tester thème clair/sombre, langues FR/EN, 320 px et 1440 px | Contrastes, boutons et contexte lisibles, sans débordement horizontal global |

### Vérifications automatisées

```bash
node scripts/qa-enterprise-admin-design2-1107.mjs
node scripts/audit-standard-enterprise-administration.mjs
node scripts/qa-standard-enterprise-governance-checks.mjs
node scripts/audit-standard-enterprise-governance-i18n.mjs
NODE_OPTIONS=--max-old-space-size=5600 ./node_modules/.bin/tsc --noEmit
```

Vérifier également `git diff --check`, Prisma client, lint, régression, build et Quality Gates de la PR. **Les vérifications automatisées ne remplacent pas les cas E2E manuels #01–22** ; noter le résultat `E2E final #1107 BON/KO` avant toute fusion.
