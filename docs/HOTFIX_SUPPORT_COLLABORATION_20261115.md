# Hotfix Support + collaborateurs + sonneries + préférences

Date : 15 novembre 2026. Branche : `fix/1182-support-collaboration-ringtones-preferences`.

## Périmètre et décisions

**Support.** Réutilisation du SLA canonique existant (`slaResolutionDueAt`, `resolvedAt`, `closedAt`, `slaPausedAt`) sans créer de nouveau calcul incompatible. La carte montre les dates, ancienneté, le retard, le statut et la priorité ; couleur rouge pour urgent/retard, ambre pour priorité haute, bleu pour ordinaire et vert pour clôture/résolution. Les photos sont limitées à 8 Mo, JPEG/PNG/WebP, vérifiées côté serveur avant stockage privé Supabase. Les pièces sont liées au ticket, et l'accès exige une session propriétaire ou un agent DTSC autorisé. Les URL signées expirent après 90 secondes.

**IA.** Le formulaire expose reformulation, rédaction professionnelle, version courte, clarification, proposition de rédaction, résumé, prochaines actions et titre. Le moteur commun orchestre le modèle et les quotas. Le texte généré n'est appliqué que par décision du demandeur et jamais envoyé sans le bouton explicite. Le mode Agent général réutilise l'outil `SUPPORT_TICKET_CREATE` existant, qui exige `requiresConfirmation: true` avec contrôle de droits/audit/idempotence ; l'outil est disponible aussi dans le contexte DTSC interne.

**Collaborateurs.** L'accusé de lecture est persisté en `CollaborationGroupMessageRead` (pas une simple remise à zéro visuelle). À l'ouverture, aller au premier message non lu ; si aucun, au plus récent. Le marqueur se clôt à la sortie, y compris pour les messages anciens jamais chargés. Le rafraîchissement ne déplace pas la position de lecture.

**Appels.** Sonneries générées localement par Web Audio : `CLASSIC`, `SOFT`, `DIGITAL`, `MELODIC`. Choix persisté par `User.incomingCallRingtone` et exposé dans les paramètres. Longueur maximale de sonnerie 18 secondes (arrêt manuel/transition d'appel). Les navigateurs peuvent bloquer la lecture automatique, ce qui ne doit pas empêcher l'appel LiveKit de fonctionner.

**Compte.** Les six rubriques personnelles utilisent une navigation compacte similaire à la page sécurité. Les commandes apparaissent dans le panneau courant, et les soumissions existantes sauvegardent en base. Aucun bouton simulé.

## Migration / dépendances

- Migration additive `prisma/migrations/20261115141000_support_ticket_media_ringtone/migration.sql`.
- Utilise les variables Supabase Storage existantes (`SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`). Aucune nouvelle variable externe exigée.
- Ne pas exécuter les migrations en production avant merge autorisé et pipeline `main`.

## Validation proposée

1. `pnpm prisma:generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:hotfix-support-collaboration`, `pnpm qa:regression`, `pnpm build`.
2. Deux comptes différents : création ticket, image JPEG/PNG/WebP, aperçu, retour après rechargement, tentative d'accès par un autre tenant = refus, permissions Support DTSC.
3. Demande en retard selon date SLA, ticket résolu avant échéance, résolu hors délai et délai suspendu ; vérifier l’affichage cohérent.
4. Support IA : chacun des huit boutons, réponse, annuler, appliquer, aucune soumission automatique ; Agent général demande confirmation avant création.
5. Un utilisateur ayant plus de trente anciens messages non lus entre dans la conversation, arrive au premier non lu, quitte, revient, badge à zéro ; tester groupes et directs, desktop et Android mobile.
6. Notification d’appel entrant depuis deux sessions distinctes, quatre sonneries, pré-écoute, arrêt, volume, persistance après rechargement ; vérifier contraintes de lecture audio Android Chrome.
7. Tous les panneaux Paramètres sur mobile et desktop ; changer langue, date, fuseau, densité, modèle, notifications, sonnerie ; vérifier persistance après reconnexion.

**Livraison :** PR de hotfix, CI vert, puis attente de `E2E final BON` du propriétaire avant fusion. Aucun déploiement manuel sur une branche.
