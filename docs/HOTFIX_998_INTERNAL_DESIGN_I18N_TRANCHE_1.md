# #998 — Design 2.0 interne : traduction FR/EN, tranche 1

## Livré dans cette tranche

- Catalogue d'interface bilingue pour 120 commandes/indicateurs communs des registres, de la trésorerie et des vues exécutives.
- Catalogue bilingue de 90 codes de statuts métier, avec repli lisible lorsque le statut est inconnu.
- Noms et descriptions en anglais des 35 registres internes HR&CFO, SCO, COO, CEO, MPO, CTO et LA, et maintien du texte métier original en français.
- Les dates et les libellés accessibles (menus, détails, confirmations, filtres) suivent la langue courante. Les données et commentaires des utilisateurs ne sont jamais traduits automatiquement.

## QA locale

```bash
node scripts/qa-hotfix-998-internal-design-i18n.mjs
node scripts/qa-console-internal-workspaces.mjs
NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit --pretty false
```

## Reliquats identifiés avant fermeture de #998

1. Traduire les centaines de libellés, descriptions, options et aides des **formulaires métier hérités** de `lib/admin-operations.ts` ; ne pas les confondre avec les champs saisis par les utilisateurs. Les labels de fiches reposent encore sur ces descriptions.
2. Vérifier tous les sous-espaces RH, paie, validations, coordination, approvisionnement et facturation, dont certains possèdent des catalogues locaux distincts.
3. Vérifier tous les chemins Desktop et mobile, états vides, erreurs et thème clair/sombre, avec bascule FR→EN→FR sans rechargement forcé.

## OWNER_E2E, non exécuté

Dans la Console DTSC, parcourir successivement les six directions + LA en anglais : navigation → registre → filtre → détails → création/modification → confirmation → trésorerie/factures. Recommencer en français, avec 320 px et bureau. Noter les chaînes encore françaises en anglais : elles constituent les reliquats de cette tranche, pas un résultat validé.

**Contrat de livraison :** cette tranche ne clôture pas l'issue #998. `LOCAL_EXECUTED` peut être coché pour les commandes effectivement réalisées ; `CI_PROVEN` et `OWNER_E2E` restent à prouver avant fusion, suivant `docs/CONTRIBUTING.md`.
