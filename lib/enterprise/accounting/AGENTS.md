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
16. Aucun UUID, enum brute, type Prisma, clé sémantique interne ou code d’erreur technique n’est présenté comme libellé principal utilisateur. Les messages clients sont orientés action et disponibles en FR/EN sur les surfaces Finance.
17. Les workspaces utilisent les primitives DTSC et les listes volumineuses restent paginées côté serveur.
18. `PROFESSIONAL_READY` ne signifie pas `COMMERCIAL_READY`.
19. `COMMERCIAL_READY` exige la validation E2E manuelle explicite du propriétaire, la Production stable et l’acceptation commerciale.
20. Aucun test E2E manuel n’est déclaré réussi sans confirmation explicite du propriétaire.
21. La Production provient uniquement de `main` après Quality Gates et revue.
22. `chart-template-registry.ts` est l’unique registre canonique des frameworks/templates comptables ; ne jamais recréer un tableau local de templates dans un service, une route ou un secteur.
23. Toute version de template `PUBLISHED` est immuable. Une correction ou évolution crée une nouvelle version traçable avec source, date de vérification et date d’effet.
24. Les modules Retail, Health, Pharmacy et futurs secteurs utilisent des clés comptables sémantiques et ne codent jamais directement des numéros de comptes réglementaires.
25. Par décision propriétaire explicite du 2026-08-09, `OHADA_SYSCOHADA@0.1.0` est la baseline officielle, immuable et le plan comptable par défaut de DTSC Platform. Le registre runtime doit la classer `OFFICIAL`; elle peut atteindre `ACCOUNTING_TEMPLATE_PRODUCTION_READY` lorsque ses contrôles techniques, mappings et états versionnés sont valides.
26. Cette exception ne relâche aucun contrôle pour les versions futures. Toute version `OHADA_SYSCOHADA` postérieure à `0.1.0` doit provenir d’une source fiable vérifiée, d’un dataset canonique fingerprinté, puis passer par validation, diff, preview et migration contrôlée avant publication/activation.
27. L’application d’un template conserve les protections `DRAFT`, absence de comptes existants, absence d’écritures `POSTED`, transaction sérialisable et isolation par `organizationId`. Aucun fallback silencieux vers un template ou un compte n’est autorisé.
28. Une organisation déjà active sur une version ne reçoit jamais une nouvelle version automatiquement. Les écritures `POSTED` restent liées à leur contexte historique et ne sont jamais réécrites pour suivre un changement de template.
29. Les overlays pays et taux fiscaux restent séparés du référentiel OHADA commun et ne sont publiés qu’avec provenance, date d’effet et QA adaptées.
