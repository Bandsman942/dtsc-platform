# QA — Sessions configurables et Web Push

Ce document complète `docs/QA_REGRESSION_CHECKLIST.md` pour le sprint transversal sessions + notifications en arrière-plan.

## Session policy

- [ ] Un compte sans préférence utilise 30 minutes d'inactivité.
- [ ] Les seules valeurs acceptées sont 15, 30, 60, 240, 480, 1440, 10080 et 43200 minutes.
- [ ] Une valeur arbitraire envoyée directement à `/api/account/session-policy` est rejetée.
- [ ] Le changement de timeout renouvelle immédiatement la session courante sans réinitialiser `authTime`.
- [ ] `absoluteExp` ne dépasse jamais 30 jours après l'authentification initiale.
- [ ] Le cookie reste HTTP-only, `sameSite=lax`, `secure` en production et conserve le domaine SSO existant.
- [ ] Un ancien token pré-sprint reste vérifiable jusqu'à son `exp`, puis est migré lors d'un heartbeat valide.

## Heartbeat

- [ ] `/api/auth/heartbeat` refuse une origine non autorisée.
- [ ] Un utilisateur supprimé/inactif reçoit 401 et son cookie est invalidé.
- [ ] Le timeout lu en base est la source de vérité.
- [ ] Les champs de contexte organisationnel sont conservés après renouvellement.
- [ ] Un heartbeat après l'échéance absolue ne crée pas de nouvelle session.
- [ ] `Rester connecté` appelle réellement le serveur.

## Multi-onglets

- [ ] Activité dans onglet A met à jour `lastActivityAt` dans onglet B de même origine.
- [ ] Onglet B ne déconnecte pas A sur la seule base de son timer local.
- [ ] Logout manuel dans A déclenche le signal logout dans B.
- [ ] Sans `BroadcastChannel`, le fallback `storage` reste fonctionnel.

## Sleep / resume

- [ ] Visible → background → retour avant expiration : heartbeat serveur valide et UI resynchronisée.
- [ ] Visible → background → retour après expiration : 401 et `/session-expired`.
- [ ] `focus`, `pageshow` et `visibilitychange` ne provoquent pas un polling permanent.
- [ ] L'application ne dépend pas d'un timer d'une seconde comme source de vérité après suspension mobile.

## Contexte multi-tenant

- [ ] Organisation A → B → heartbeat conserve B.
- [ ] DTSC_INTERNAL → ORGANIZATION → heartbeat conserve ORGANIZATION.
- [ ] Changer de contexte ne rallonge pas la durée absolue.

## Push — permission et abonnement

- [ ] `Notification.requestPermission()` n'est appelé qu'après clic explicite.
- [ ] Permission `default` : état UX explicite.
- [ ] Permission `denied` : état bloqué explicite, aucun faux statut Activé.
- [ ] Permission `granted` sans subscription : état à renouveler.
- [ ] Permission `granted` avec subscription : état Activé.
- [ ] Web Push non supporté : dégradation sans erreur de page.
- [ ] VAPID non configuré : UI indique la configuration manquante, build non cassé.
- [ ] Sur contexte Apple non standalone détectable, l'aide écran d'accueil est affichée sans user-agent sniffing.

## Push — API

- [ ] POST/DELETE refusent origine invalide.
- [ ] POST/DELETE exigent utilisateur ACTIVE.
- [ ] Un endpoint non HTTPS/local est rejeté.
- [ ] Un endpoint appartenant à un autre user ne peut pas être transféré.
- [ ] Plusieurs endpoints distincts peuvent appartenir au même utilisateur.
- [ ] GET ne renvoie jamais les endpoints ou secrets d'abonnement.
- [ ] La clé privée VAPID n'est jamais exposée au client.

## Push — livraison

- [ ] `notifyUser` persiste d'abord la Notification DTSC puis tente le Push.
- [ ] Une panne du fournisseur Push ne rollback pas l'action métier.
- [ ] Réponse 404/410 supprime l'abonnement devenu invalide.
- [ ] Le transport est borné par timeout réseau.
- [ ] Le payload n'inclut pas le corps métier complet.
- [ ] Santé/pharmacie/RH/finance/juridique restent neutres sur lock screen.

## Service Worker

- [ ] `push` affiche une notification même sans page DTSC ouverte lorsque la plateforme le permet.
- [ ] Payload JSON malformé utilise un fallback sans crash.
- [ ] `notificationclick` ferme la notification.
- [ ] Une fenêtre DTSC existante est naviguée/focusée ; sinon `openWindow`.
- [ ] Une URL externe, `//host` ou invalide retombe sur `/notifications`.
- [ ] API/pages privées ne sont pas mises en Cache Storage.
- [ ] Badging API est progressive enhancement uniquement.

## Logout

- [ ] Logout manuel supprime l'abonnement du terminal courant.
- [ ] Les autres appareils restent abonnés.
- [ ] Expiration automatique ne supprime pas les abonnements Push.
- [ ] Le Push ne renouvelle jamais la session.

## Notifications métier

- [ ] Mes Collaborateurs : message → Notification DB + Push si autorisé.
- [ ] Appel entrant groupe → Notification DB + Push ; LiveKit ne reste pas artificiellement connecté en background.
- [ ] Support → Notification DB + Push.
- [ ] Invitations → Notification DB + Push.
- [ ] Annonces → Notification DB + Push.
- [ ] Activités DTSC : demande/tâche mise à jour → Notification DB + Push.
- [ ] Pharmacie/alertes existantes passant par `notifyUser(s)` bénéficient du dispatcher.

## Plateformes

### Desktop

- [ ] Chrome/Chromium réel.
- [ ] Firefox réel si disponible.
- [ ] fermeture de toutes les pages DTSC puis push système.

### Android

- [ ] PWA installée réelle.
- [ ] application quittée, push reçu, tap et ouverture cible.

### iPhone/iPad

- [ ] PWA ajoutée à l'écran d'accueil.
- [ ] permission demandée depuis une interaction dans la PWA.
- [ ] application fermée, push reçu si environnement Apple compatible.

Ne jamais cocher les validations physiques ci-dessus sur la seule base d'un build Vercel ou d'une émulation.
