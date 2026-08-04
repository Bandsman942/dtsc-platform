# Catalogue fournisseurs et modèles IA

## Source canonique

- `lib/ai/catalog.ts`
- types : `lib/ai/types.ts`
- configuration optionnelle : `AI_PROVIDER_CATALOG_JSON` et `AI_MODEL_CATALOG_JSON`

Le catalogue OpenAI existant est conservé comme valeur par défaut. D’autres fournisseurs compatibles avec le protocole Responses peuvent être activés par configuration, sans modifier les routes métier.

## Fournisseur

Chaque fournisseur définit code, clés i18n, protocole, URL, variable de secret, statut, régions, politique de données et streaming. Les secrets ne sont jamais stockés dans le catalogue ni exposés au client.

## Modèle

Chaque modèle définit code, identifiant fournisseur, capacités, contexte maximal, sortie maximale, streaming, coût éventuel, contextes, locales, plan minimal, politique de données, tâches supportées et fallbacks.

Un tarif absent produit un coût `UNKNOWN`, jamais zéro inventé. Un modèle désactivé, interdit par le contexte, non disponible ou sans secret configuré n’est pas sélectionnable.
