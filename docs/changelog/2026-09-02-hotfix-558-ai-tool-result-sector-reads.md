# 2026-09-02 — Hotfix #558 AI nested values + sector READs

## Corrigé

- Les valeurs métier imbriquées des résultats d’outils IA ne sont plus remplacées prématurément par `[résumé borné]` lorsqu’elles sont encore autorisées et utiles.
- Les flux Trésorerie/Caisse peuvent transmettre leurs montants, devises, dates, références et libellés de comptes au modèle dans les limites de sécurité.
- La sérialisation ne coupe plus arbitrairement une chaîne JSON au-delà d’un seuil : la réduction est désormais structurelle et le JSON reste valide.
- Les READ ERP ne sont plus limités à `ENTERPRISE_GENERAL` lorsque le moteur a sélectionné un assistant sectoriel compatible.

## Assistants compatibles

- ERP commun : `ENTERPRISE_GENERAL`, `SHOP_ASSISTANT`, `PHARMACY_ASSISTANT`, `HEALTH_ASSISTANT`.
- Retail : `ENTERPRISE_GENERAL`, `SHOP_ASSISTANT` uniquement.

Le RBAC utilisateur, l’organisation active, les modules, le plan, le secteur, les entitlements et les dépendances restent opposables à chaque invocation.

## Mobile Money

`ERP_MOBILE_MONEY_READ` peut désormais être exposé au `SHOP_ASSISTANT` lorsque `MOBILE_MONEY_AGENCY` est réellement autorisé. La projection conserve principal, devise, frais client, commission opérateur, effets caisse/float, références et statuts, sans exposer les numéros de téléphone bruts.

## QA

- Ajout de `scripts/qa-hotfix-558-ai-tool-result-sector-reads.mjs` avec exécution réelle des helpers de sérialisation et de compatibilité assistant.
- Mise à jour de la QA #556 pour ne plus considérer la restriction `ENTERPRISE_GENERAL` seule comme un invariant valide.
- Intégration de #558 au gate standard IA iteration 05.

## Migration / configuration

- Aucune migration Prisma.
- Aucune nouvelle variable d’environnement.
- Aucun Preview Vercel de branche.
