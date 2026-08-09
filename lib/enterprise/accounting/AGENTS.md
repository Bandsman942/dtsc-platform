# AGENTS.md — Comptabilité et Finance avancée

Ces règles s’appliquent à tous les fichiers de `lib/enterprise/accounting/` et complètent le `AGENTS.md` racine.

1. Toute écriture comptabilisée est équilibrée et immuable.
2. Toute correction utilise une contrepassation liée ou une procédure contrôlée ; jamais de modification de l’original.
3. Toute comptabilisation possède une source unique, une version et une clé d’idempotence stable.
4. Une période fermée ou verrouillée bloque les mutations interdites.
5. Une réouverture exige une permission dédiée, un motif, un acteur indépendant et un audit.
6. Les comptes utilisés ne sont jamais supprimés physiquement ; ils sont désactivés avec conservation de l’historique.
7. Les taux fiscaux sont historisés par date d’effet et ne réécrivent jamais les transactions passées.
8. Un état publié est identifiable, horodaté, vérifiable et non modifiable.
9. Un actif opérationnel reste distinct de son profil d’immobilisation comptable.
10. Le stock physique reste distinct de ses couches et événements de valorisation comptable.
11. Un amortissement et une valorisation ne peuvent pas être exécutés deux fois pour la même source et période.
12. Les exports et consultations financières respectent tenant, module, permission, données sensibles et audit.
13. Une relation active avec une entreprise, un rôle global DTSC ou un rôle `MANAGER` ne donne aucun accès Finance automatique.
14. Toute référence comptable fournie par le client est revalidée dans le même `organizationId`.
15. Les migrations historiques ne sont jamais modifiées et toute évolution de schéma reste additive et non destructive.
16. Aucun UUID, enum brute, type Prisma ou code d’erreur technique n’est présenté comme libellé utilisateur.
17. Les workspaces utilisent les primitives DTSC et les listes volumineuses restent paginées côté serveur.
18. `PROFESSIONAL_READY` ne signifie pas `COMMERCIAL_READY`.
19. `COMMERCIAL_READY` exige la validation E2E manuelle explicite du propriétaire, la Production stable et l’acceptation commerciale.
20. Aucun test E2E manuel n’est déclaré réussi sans confirmation explicite du propriétaire.
21. La Production provient uniquement de `main` après Quality Gates et revue.
22. `chart-template-registry.ts` est l’unique registre canonique des frameworks/templates comptables ; ne jamais recréer un tableau local de templates dans un service, une route ou un secteur.
23. Toute version de template `PUBLISHED` est immuable. Une correction ou évolution crée une nouvelle version traçable avec source, date de vérification et date d’effet.
24. Les modules Retail, Health, Pharmacy et futurs secteurs utilisent des clés comptables sémantiques et ne codent jamais directement des numéros de comptes réglementaires.
25. Un template réglementaire exige normalement une provenance officielle ou légalement exploitable ; aucune règle, classe, compte, rubrique ou date réglementaire n’est inventée pour compléter une source incomplète. Exception unique décidée par le propriétaire le 2026-08-09 : `OHADA_SYSCOHADA@0.1.0` peut être publié comme bootstrap runtime à partir du PDF utilisateur fingerprinté dans `templates/syscohada/source-manifest.json`. Cette exception n’autorise aucune déclaration de conformité réglementaire et ne vaut pour aucune version ultérieure.
26. L’application d’un template conserve les protections `DRAFT`, absence de comptes existants, absence d’écritures `POSTED`, transaction sérialisable et isolation par `organizationId`. Aucun fallback silencieux vers un template ou un compte n’est autorisé.
27. Hors exception exacte `OHADA_SYSCOHADA@0.1.0`, `OHADA_SYSCOHADA` ne peut jamais passer à `PUBLISHED` tant que `templates/syscohada/source-manifest.json` n’atteste pas un fichier source vérifié, un dataset canonique fingerprinté et un statut d’utilisation `AUTHORIZED_FOR_DTSC_IMPLEMENTATION`. Une notice officielle ne suffit pas à elle seule à autoriser la reproduction du dataset. Le bootstrap 0.1.0 ne peut jamais recevoir `ACCOUNTING_TEMPLATE_PRODUCTION_READY` tant que la chaîne normale de confiance n’a pas été satisfaite par une version ultérieure.
