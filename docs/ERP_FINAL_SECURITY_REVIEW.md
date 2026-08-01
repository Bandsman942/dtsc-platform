# ERP — Revue finale de sécurité

## Contrat serveur

Toute mutation sensible vérifie : session, organisation active, membre actif, type CLIENT, module, entitlement, permission, visibilité objet, same-origin, validation Zod, `await rateLimit`, transaction et audit.

## Scénarios revus

- **IDOR** : chaque identifiant est résolu avec `organizationId` et la permission du module.
- **Accès inter-tenant** : aucune relation fournie par le client n’est acceptée sans preuve d’appartenance à la même organisation.
- **Élévation de privilège** : `MANAGER` n’est pas automatiquement administrateur ; les postes et permissions canoniques font autorité.
- **Données cliniques** : les services Finance ne reçoivent ni diagnostic, ni symptômes, ni prescription, ni résultat de laboratoire, ni note médicale.
- **Finance** : factures, paiements, allocations et écritures sont idempotents ; les périodes fermées et écritures POSTED sont protégées.
- **Pharmacy** : quantité, lot, qualité et pharmacovigilance restent sous permissions Pharmacy.
- **Documents/exports** : accès tenant-scoped, stockage privé et audit de téléchargement sensible.
- **Routes retirées** : les mutations Core/Sector/Workflow renvoient `410 Gone` après contrôle d’accès et créent un audit borné.
- **Notifications/deep links** : destination précise mais contenu générique lorsque la donnée est verrouillée.
- **Rate limit** : les routes mutantes attendent réellement `await rateLimit`.

## Secrets

Aucun secret ne doit apparaître dans les composants clients, fixtures, migrations, captures, rapports ou logs. Les intégrations externes utilisent exclusivement les variables d’environnement serveur.

## Résultat

La Release A réduit la surface d’attaque en supprimant les anciens chemins d’écriture sans ouvrir de bypass de compatibilité. La suppression physique reste hors périmètre et nécessite une revue séparée.
