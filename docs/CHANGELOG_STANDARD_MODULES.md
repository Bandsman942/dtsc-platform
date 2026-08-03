# Changelog — Modules standards DTSC

## Itération 2 — Espace personnel SaaS

### Ajouté

- agrégateur canonique et borné du Dashboard personnel ;
- actions attendues issues des invitations, relations, notifications, tickets et abonnements réels ;
- vue Abonnement alignée sur le catalogue, les entitlements, les limites et la consommation ;
- distinction explicite entre profil professionnel, organisation, membership, relation et contexte actif ;
- recherche et pagination serveur du centre Notifications ;
- historique des invitations et réponses idempotentes ;
- affichage honnête de la session signée actuelle ;
- huit guides utilisateur embarqués et documentaires ;
- audits dédiés et Quality Gate de l’itération 2.

### Renforcé

- changement de contexte : same-origin, rate limit, reason codes, vérification du membership, renouvellement de session et audit ;
- invitation : propriété du destinataire, idempotence, historique et notification de l’émetteur ;
- liens profonds : cible interne précise et contrôle d’accès conservé ;
- performance : requêtes parallèles, compteurs serveur et listes limitées.

### Gouvernance

- aucune migration Prisma ;
- aucune simulation d’archivage de notification ou de registre multi-session ;
- aucune duplication des moteurs ERP ;
- aucun passage automatique vers `COMMERCIAL_READY` ;
- E2E manuels au statut `NON_EXÉCUTÉ`.

## Itération 1 — Fondations professionnelles

### Ajouté

- registre canonique des surfaces non ERP ;
- modèle distinct de statut technique et maturité commerciale ;
- familles, domaines, hosts, plans, dépendances et contrats QA ;
- résolveur central d’accès et capacités ;
- navigation multidomaine et deep links standard ;
- audits registre, navigation, routes, maturité, permissions, guides, langue, mobile, multidomaine et readiness ;
- contrats professionnel, responsive, accessibilité, langue et guides ;
- inventaire initial et plan E2E manuel.

### Gouvernance

- aucune promotion automatique vers `COMMERCIAL_READY` ;
- aucune migration Prisma ;
- aucune duplication d’un moteur ERP ;
- les écarts de guides et routes BETA restent explicitement documentés.
