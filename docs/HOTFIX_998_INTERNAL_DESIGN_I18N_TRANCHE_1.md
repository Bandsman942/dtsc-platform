# #998 — Design 2.0 interne : traduction FR/EN, tranches 1 et 2

## Livré dans cette tranche

- Catalogue d'interface bilingue pour 120 commandes/indicateurs communs des registres, de la trésorerie et des vues exécutives.
- Catalogue bilingue de 90 codes de statuts métier, avec repli lisible lorsque le statut est inconnu.
- Noms et descriptions en anglais des 35 registres internes HR&CFO, SCO, COO, CEO, MPO, CTO et LA, et maintien du texte métier original en français.
- Traduction explicite des 291 libellés, aides et exemples de champs historiques de `lib/admin-operations.ts`. Le catalogue est exhaustif pour les chaînes littérales de champs de ce constructeur et vérifié par un inventaire automatique. Les options dynamiques (noms, références saisies) restent intactes ; seuls les codes de statut système sont localisés.
- Traduction des 115 textes sources inventoriés dans les synthèses CEO/juridiques et les parcours recommandés des directions (titres, descriptions, indicateurs et aides). Recherche possible avec les titres en anglais sans modifier les clés métier utilisées par la navigation.
- Les dates et les libellés accessibles (menus, détails, confirmations, filtres) suivent la langue courante. Les données et commentaires des utilisateurs ne sont jamais traduits automatiquement.

## QA locale

```bash
node scripts/qa-hotfix-998-internal-design-i18n.mjs
node scripts/qa-console-internal-workspaces.mjs
NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit --pretty false
```

## Reliquats identifiés avant fermeture de #998

1. Localiser les métadonnées **fabriquées à l'exécution** dans les fiches individuelles et autres composants périphériques lorsque cela correspond à une information système, sans modifier les données saisies par les utilisateurs.
2. Vérifier tous les sous-espaces RH, paie, validations, coordination, approvisionnement et facturation, dont certains possèdent des catalogues locaux distincts ; corriger les libellés restants de ces composants.
3. Vérifier tous les chemins Desktop et mobile, états vides, erreurs et thème clair/sombre, avec bascule FR→EN→FR sans rechargement forcé.

## OWNER_E2E, non exécuté

Dans la Console DTSC, parcourir successivement les six directions + LA en anglais : navigation → registre → filtre → détails → création/modification → confirmation → trésorerie/factures. Recommencer en français, avec 320 px et bureau. Toute chaîne système encore française en anglais est un reliquat à corriger avant clôture.

**Contrat de livraison :** cette tranche ne clôture pas l'issue #998. `LOCAL_EXECUTED` peut être coché pour les commandes effectivement réalisées ; `CI_PROVEN` et `OWNER_E2E` restent à prouver avant fusion, suivant `docs/CONTRIBUTING.md`.
