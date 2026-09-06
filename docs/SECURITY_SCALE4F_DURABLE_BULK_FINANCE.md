# Sécurité #515 — SCALE-4F

## Frontières serveur

### Import bancaire
- autorisation Finance canonique `FINANCE_BANK:create` avant enqueue ;
- compte financier revalidé dans le même `organizationId` avant enqueue et au worker ;
- devise revalidée ;
- aucune donnée bulk dans une URL ou un log ;
- staging privé tenant-scoped ;
- route de statut protégée par `FINANCE_BANK:view`.

### Export Audit
- session et rate limit avant création ;
- `requireEnterpriseGovernanceAccess` avant création, au worker et au téléchargement ;
- `sensitiveExportApproval` vérifié avant création, au worker et au téléchargement ;
- artefact privé tenant-scoped, sans `getPublicUrl` ;
- expiration et purge ;
- téléchargement `private, no-store`.

### Worker
- route interne protégée par secret Bearer serveur ;
- aucun secret transmis au client ;
- claim atomique et lease ;
- aucun payload financier brut dans les métriques de queue.

## Isolation tenant

Les chemins privés ont toujours le préfixe `enterprise-bulk/<organizationId>/` et les fonctions de lecture/suppression refusent un chemin hors de ce préfixe. Toutes les requêtes Prisma du worker sont filtrées par `organizationId`.

## CSV

Les cellules exportées neutralisent les préfixes interprétables comme formule par un tableur. Les références et métadonnées restent échappées selon le format CSV.
