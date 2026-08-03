# Contrat UX des extensions sectorielles ERP

## 1. Structure obligatoire

Toute extension Health ou Pharmacy active utilise les primitives DTSC :

```text
ModuleWorkspace
→ ModuleHeader
→ ModuleMetrics
→ ModuleToolbar / ListControls
→ ModuleContent
   → ModuleSection
      → BusinessList
      → BusinessDetail
      → ContextActions
      → formulaire métier
```

Un module actif ne peut pas être un simple CRUD générique ni un assemblage de cartes décoratives.

## 2. Contenu sectoriel

L’identité DTSC reste commune, mais le vocabulaire, les indicateurs, les risques, les actions et les workflows restent sectoriels.

- Health conserve patient, consultation, dossier médical, laboratoire et confidentialité clinique.
- Pharmacy conserve médicaments, lots, FEFO, péremption, rappels et pharmacovigilance.

## 3. Formulaires

Les formulaires longs sont structurés en étapes ou sections. Ils gèrent création, modification, erreurs par champ, erreur globale, double soumission, conflit de révision, fermeture avec modifications, permissions, pièces jointes réelles et références métier recherchables.

Aucun UUID, enum brute, type Prisma ou clé camelCase n’est affiché. Les fichiers utilisent un véritable upload privé.

## 4. Listes et détails

Les listes proposent recherche, filtres, pagination et états vides. Les détails affichent les informations métier, documents, historique, décisions et actions autorisées. Les actions passent par le menu contextuel et sont validées côté serveur.

## 5. Mobile

Points de contrôle : 320, 360, 390, 412 px, tablette et desktop.

- aucun débordement global ;
- KPI et navigation secondaire en rail horizontal tactile ;
- mots normaux non cassés ;
- champs à 16 px minimum ;
- dialogs plein écran ou scrollables ;
- safe areas et navigation basse stables ;
- boutons tactiles ;
- parcours liste → détail → formulaire → retour ;
- tableaux remplacés par listes structurées sur petit écran.

## 6. Français

En locale française, les labels et statuts utilisent des dictionnaires contrôlés. Toute erreur explique le problème, la raison et l’action possible. Aucun code technique ou texte anglais n’est visible.

## 7. Navigation

L’ordre, les groupes et les icônes viennent du registre canonique. Le module actif porte `aria-current="page"`, reste visible dans le rail et demeure sélectionné sur ses sous-routes.

Relations avec les entreprises reste visible globalement, sans organisation active.

## 8. Notifications et liens profonds

Une notification ouvre le module, l’objet précis, la section et l’action attendue après contrôle d’accès. Les notifications sensibles restent génériques et n’exposent aucun diagnostic, résultat ou prescription.

## 9. Aide

Chaque module fournit une première action, les permissions nécessaires, les limites connues, le support et la procédure de signalement.

## 10. Validation

Le respect de ce contrat est vérifié par les QA responsives, linguistiques, de navigation, de confidentialité et par la campagne E2E manuelle du propriétaire.
