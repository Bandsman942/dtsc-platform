# Hotfix #558 — Valeurs métier imbriquées et READ ERP sectoriels

## Français

### Objectif

Ce hotfix corrige deux régressions observées après #556 :

1. des valeurs métier autorisées pouvaient être remplacées par `[résumé borné]` lorsque le résultat d’un outil était profondément imbriqué ;
2. les nouveaux READ ERP étaient limités à `ENTERPRISE_GENERAL`, alors que DTSC Platform sélectionne automatiquement des assistants sectoriels dans certaines entreprises.

### Sérialisation des résultats d’outils

Les résultats certifiés passent désormais par `lib/ai/agent/tool-result.ts`.

Le sérialiseur :

- conserve les valeurs primitives métier utiles, y compris dans des structures imbriquées ;
- filtre toujours les clés privées ou techniques comme identifiants backend, secrets, tokens, payloads bruts et métadonnées internes ;
- borne la profondeur, le nombre d’éléments d’un tableau, le nombre de champs d’un objet et la longueur des chaînes ;
- réduit progressivement la structure lorsqu’un résultat est trop volumineux ;
- produit toujours un JSON valide ;
- n’effectue plus de découpe arbitraire du JSON sérialisé avec `slice(0, N)`.

Ce contrat permet notamment à `FINANCE_TREASURY_READ` et `FINANCE_CASH_READ` de transmettre au modèle les montants, devises, dates, références, statuts et libellés de comptes autorisés présents dans les flux récents.

### Compatibilité des assistants ERP

Les READ ERP communs sont compatibles avec :

- `ENTERPRISE_GENERAL` ;
- `SHOP_ASSISTANT` ;
- `PHARMACY_ASSISTANT` ;
- `HEALTH_ASSISTANT`.

Les READ Retail restent volontairement limités à :

- `ENTERPRISE_GENERAL` ;
- `SHOP_ASSISTANT`.

Cette compatibilité ne constitue jamais une permission utilisateur. Chaque outil reste soumis à `authorizeAiTool()` puis à `resolveEnterpriseModuleAccess(..., "read")` pour le module requis, l’utilisateur, l’organisation, le plan, le secteur, les entitlements et les dépendances.

### Mobile Money

`ERP_MOBILE_MONEY_READ` conserve sa projection bornée incluant notamment :

- `principalAmount` ;
- `currencyCode` ;
- `customerFeeAmount` ;
- `providerCommissionAmount` ;
- `cashEffectAmount` ;
- `floatEffectAmount` ;
- références et statuts utiles.

Les numéros de téléphone bruts ne sont pas transmis au modèle.

### QA permanente

`scripts/qa-hotfix-558-ai-tool-result-sector-reads.mjs` exécute les helpers réels du hotfix et vérifie :

- qu’un résultat Trésorerie imbriqué conserve montant, devise, date, référence et compte ;
- que les flux et sessions de Caisse conservent leurs montants ;
- que Mobile Money conserve principal, frais et commission ;
- qu’un résultat volumineux reste un JSON valide et borné ;
- que les champs privés restent filtrés ;
- que les assistants ERP communs et Retail respectent la matrice de compatibilité ;
- que le contrôle module/RBAC reste présent dans l’autorisation serveur.

Le test est intégré au gate standard IA `scripts/qa-standard-modules-iteration-05.mjs`.

### Migration et déploiement

Aucune migration Prisma et aucune nouvelle variable d’environnement. Aucun Preview Vercel de branche. Production uniquement après merge sur `main`, CI complète et OWNER_E2E.

## English

### Goal

This hotfix fixes two regressions left after #556: deeply nested authorized business values could collapse into bounded summaries, and the new ERP READ tools were restricted to `ENTERPRISE_GENERAL` even when DTSC Platform automatically selected a sector assistant.

### Tool-result serialization

Certified tool results now use a dedicated structural serializer that preserves authorized primitive business values, filters private/backend fields, progressively reduces oversized structures, and always emits valid JSON. It no longer truncates serialized JSON strings arbitrarily.

### Assistant compatibility

Common ERP READ tools support Enterprise, Shop, Pharmacy and Health assistant profiles. Retail READ tools remain limited to Enterprise and Shop assistants. This never bypasses user permissions: module-level server authorization remains mandatory for every invocation.

### Permanent QA

The #558 QA executes the real serializer and assistant-policy helpers against Treasury, Cash and Mobile Money fixtures and is part of the standard AI iteration 05 gate.
