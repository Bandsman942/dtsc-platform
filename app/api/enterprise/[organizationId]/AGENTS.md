# AGENTS.md — API entreprise et Finance

Ces règles complètent le fichier racine pour toutes les routes de ce dossier.

1. Toute route Finance vérifie session, organisation active, membership, organisation cliente, module, entitlement, permission, visibilité, same-origin pour les mutations, Zod, rate limit, transaction, ApiLog et AuditLog.
2. Toute référence reçue est revalidée dans le même `organizationId`; un rôle global DTSC n’est jamais un bypass.
3. Une facture émise possède une créance ou dette commune unique. Toute tentative dupliquée doit être idempotente ou refusée explicitement.
4. Tout paiement utilise le moteur commun. Les allocations sont bornées, idempotentes et immuables après confirmation sans procédure de contrepassation.
5. Aucun double paiement, double transfert, double posting ou double rapprochement n’est autorisé.
6. Une écriture comptabilisée est immuable. Les corrections utilisent annulation avant posting, avoir, remboursement ou contrepassation.
7. Une période fermée ou verrouillée bloque toute mutation interdite sans écriture partielle.
8. Le créateur ne peut pas approuver sa propre opération lorsque la séparation des rôles est requise.
9. Une caisse ne possède qu’une session active compatible ; une clôture indépendante conserve comptage, écart, motif et décision.
10. Les imports bancaires contrôlent type, taille, contenu, devise, compte, organisation, doublons et journalisation sensible.
11. Une ligne bancaire ne peut pas être rapprochée plusieurs fois ; une session clôturée n’est pas modifiée silencieusement.
12. Les fichiers financiers passent par le stockage privé commun ; aucun numéro bancaire complet, document, salaire ou relevé intégral ne va dans les logs.
13. Les commentaires Finance sont tenant-scoped, author-only pour modification/suppression logique et audités.
14. Les migrations restent additives, les migrations historiques ne sont jamais modifiées et aucune donnée financière n’est physiquement supprimée par un rollback.
15. `COMMERCIAL_READY` ne peut être activé par une route ou un script automatique sans confirmation manuelle explicite du propriétaire.
