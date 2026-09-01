# 2026-09-01 — Hotfix IA Entreprise : lectures ERP Finance via Tool Gateway

## Visible pour les utilisateurs

- L’Assistant IA Entreprise utilise désormais le runtime agentique DTSC lorsqu’une conversation autorise les outils métier.
- L’IA peut lire les données Finance réellement accessibles à l’utilisateur au lieu de seulement connaître le nom des modules disponibles.
- Les capacités ajoutées couvrent : vue financière, budgets, créances, dettes, paiements, trésorerie, caisse, banque, rapprochement, comptabilité, taxes, clôture, états financiers, immobilisations et valorisation du stock.
- Les lectures sont bornées et respectent le contexte de l’entreprise active, le plan, les dépendances et les permissions des modules. Les budgets conservent également leur visibilité utilisateur existante.
- Les montants ne sont jamais additionnés entre devises différentes.
- Une lecture réussie sans données est distinguée d’une erreur ou d’un refus d’accès : une panne backend n’est jamais présentée comme un montant nul.
- L’IA ne doit plus annoncer « je vais tenter » ou « je procède » sans exécuter réellement un outil dans le tour courant.
- Les actions qui modifient des données, comme la création d’un ticket support, restent soumises à une confirmation structurelle explicite dans l’interface avant exécution.

## Sécurité et gouvernance

- Aucun changement de schéma Prisma ni migration.
- Aucun outil Finance ne réalise de mutation métier.
- Les outils Finance sont exposés uniquement par le Tool Gateway canonique après autorisation du contexte, de l’entitlement IA et du module concerné.
- Les requêtes de détail sont limitées à 25 éléments maximum par appel.
- Les exécutions continuent d’être tracées dans le journal canonique des outils IA.

## Rollback

Revenir sur le commit du hotfix restaure le chemin de chat Enterprise précédent et retire les outils Finance natifs sans nécessiter de rollback de base de données.
