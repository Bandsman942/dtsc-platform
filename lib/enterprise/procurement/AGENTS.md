# Règles locales — Enterprise documents & procurement

Ces règles complètent les `AGENTS.md` racine, `lib/AGENTS.md`, `app/api/enterprise/AGENTS.md` et `prisma/AGENTS.md` pour le Sprint 7 et les évolutions futures des domaines Documents / Fournisseurs / Achats.

- `EnterpriseDocument`, `EnterpriseSupplier` et `EnterprisePurchase` sont les sources de vérité des nouvelles données ERP communes de ces domaines. Ne pas créer de nouveaux `EnterpriseCoreRecord` `DOCUMENT`, `SUPPLIER` ou `PURCHASE` lorsqu’un modèle dédié s’applique.
- Les fichiers `EnterpriseDocument` utilisent exclusivement le stockage privé contrôlé côté serveur. Les URL publiques arbitraires, `getPublicUrl()` et les `storagePath` fournis librement par le navigateur sont interdits.
- Toute URL signée de téléchargement doit être émise après revalidation serveur de la session, du membership actif, du module, de la visibilité documentaire et du droit de téléchargement. Les URLs signées doivent rester temporaires.
- Les versions documentaires sont immuables après création. Toute nouvelle version incrémente `currentVersion` avec garde `revision`; ne pas écraser un objet de stockage existant avec `upsert`.
- Les documents `RESTRICTED` utilisent `EnterpriseDocumentAccess`; ne jamais encoder une liste d’utilisateurs autorisés dans une chaîne ou un JSON libre.
- Tous les liens `EnterpriseEntityLink`, fournisseurs affectés, demandes sources, approbations, achats, documents, lignes et réceptions doivent appartenir au même `organizationId`.
- Les fournisseurs sont des tiers métier et ne nécessitent pas de compte `User` ni de `OrganizationMember`.
- Un fournisseur `SUSPENDED` ou `INACTIVE` ne peut pas être utilisé pour une nouvelle soumission/commande normale.
- Les montants d’achat sont recalculés côté serveur avec `Prisma.Decimal` depuis les lignes. Un `totalAmount` fourni par le client n’est jamais une source de vérité.
- Les approbations d’achat réutilisent `EnterpriseApproval`. Ne pas créer de modèle ou moteur `PurchaseApproval` parallèle.
- Les décisions d’approbation et transitions d’achat sensibles utilisent l’état attendu + `revision` dans une opération atomique et retournent `409 Conflict` en cas de concurrence.
- Les quantités reçues cumulées ne peuvent jamais dépasser les quantités commandées dans le workflow normal.
- `EnterprisePurchaseReceipt` ne modifie jamais directement les stocks PHARMACY, HEALTH_CARE ou d’un autre secteur spécialisé. Les tables sectorielles restent la source métier du stock.
- Une approbation, commande ou réception Sprint 7 ne crée pas `EnterpriseExpense`, ne débite pas `EnterpriseBudget` et ne crée pas d’écriture comptable générale. Cette intégration appartient au Sprint 8.
- Les commentaires et timelines réutilisent `EnterpriseOperationalComment` et `EnterpriseOperationalEvent`; ne pas rattacher les nouveaux objets uniquement à `EnterpriseCoreRecord` pour obtenir un historique.
- Les listes Documents / Fournisseurs / Achats restent paginées, recherchées, filtrées et triées côté serveur.
- Les mutations conservent `isSameOriginRequest()`, un schéma Zod métier dédié, `await rateLimit(...)`, `ApiLog` et l’audit approprié.
- Les déploiements Vercel restent production-only depuis `main`. Une preview volontairement désactivée n’est ni une erreur fonctionnelle ni une validation fonctionnelle. Ne jamais lancer `vercel`, `vercel deploy` ou `vercel --prod` depuis une branche feature.
