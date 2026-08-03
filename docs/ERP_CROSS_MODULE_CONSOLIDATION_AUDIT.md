# Audit de consolidation inter-modules ERP

**SHA de départ :** `bef573d954c4c63d7fb43532628faae059a773bb`
**Branche :** `feat/erp-professionalization-final-consolidation`

## Résultat de l’audit de code

Le dépôt possède déjà un registre canonique, `EnterpriseEntityLink`, un outbox durable `EnterpriseDomainEvent`, un worker avec retries, des services Finance idempotents et des extensions Health/Pharmacy vers une facture commune. La consolidation réutilise ces mécanismes au lieu d’introduire un broker ou une seconde source.

## Dette corrigée

- publication durable désormais appelée par les helpers CRM/ventes, achats, RH/paie, projets/actifs et Finance ;
- empreinte des métadonnées intégrée à l’idempotence pour distinguer mouvements et allocations légitimes ;
- reçus `EnterpriseCrossModuleProjection` par consommateur ;
- états `PENDING/PROCESSING/COMPLETED/FAILED/DEAD`, tentatives, erreur et reprise contrôlée ;
- liens structurels réciproques et deep links exacts ;
- vue Finance des erreurs récentes sans exposition clinique ;
- audits et QA opposables.

## Points non inventés

La validation sur copie anonymisée et les E2E authentifiés finaux exigent les données/comptes du propriétaire. Ils restent explicitement en attente. Aucun module n’est promu automatiquement vers `COMMERCIAL_READY`.
