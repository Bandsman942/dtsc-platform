# Changelog — Gaming Lounge foundation #639

Parent : #638
Pull Request : #647

## Ajouté

- Sous-secteur canonique `GAMING_LOUNGE` rattaché à `HOSPITALITY_EVENTS`, conservé en statut `PLANNED` pendant la fondation.
- Registre Gaming dédié avec les modules `GAMING_DASHBOARD`, `GAMING_STATIONS`, `GAMING_SESSIONS`, `GAMING_BOOKINGS`, `GAMING_PRICING_PACKAGES`, `GAMING_CHECKOUT`, `GAMING_DAILY_CLOSE`, `GAMING_TOURNAMENTS` et `GAMING_REPORTS`.
- Contrat de domaine centralisé pour les statuts de postes, sessions, réservations et modes de tarification.
- Modèles Prisma tenant-scoped `EnterpriseGamingConfiguration`, `EnterpriseGamingStationProfile`, `EnterpriseGamingBooking`, `EnterpriseGamingPricingRule` et `EnterpriseGamingSession`.
- Migration additive `20260914163000_gaming_lounge_foundation`.
- Documentation d'architecture `docs/ERP_GAMING_LOUNGE.md` pour les sources de vérité, invariants, isolation multi-tenant, Finance/devises et programme #639 à #646.

## Sécurisé

- Tous les modules Gaming restent `PLANNED`, `HIDDEN`, sans workspace et avec `EXPLICIT_DENY` : aucun parcours client n'est activé par #639.
- Les postes réutilisent `EnterpriseAsset`, les joueurs identifiés le CRM commun, les services le catalogue commun et les paiements/trésorerie la Finance commune ; aucune source de vérité parallèle Gaming n'est créée.
- Toutes les entités Gaming portent `organizationId` et les relations internes utilisent des clés tenant-aware.
- Les références cross-domain vers Asset, CRM et Catalog restent destinées à être revalidées côté service dans le même tenant avant toute mutation des lots fonctionnels.
- Un index unique partiel PostgreSQL empêche plus d'une session non archivée en statut `ACTIVE` ou `PAUSED` sur la même station.
- La durée facturable future reste fondée sur les timestamps serveur persistés, jamais sur un chronomètre navigateur faisant autorité.

## Qualité

- Ajout de `scripts/qa-639-gaming-lounge-foundation.mjs`, exécuté par la régression globale.
- La QA vérifie le rattachement sectoriel, le fail-closed, les collisions de codes, les dépendances canoniques, les cycles Gaming, l'ordre de navigation typé, l'absence de sources ERP dupliquées, le caractère additif de la migration et l'index anti-double-session live.
- Les preuves finales restent celles de la CI du head exact de la PR #647 ; ce changelog ne remplace aucune preuve d'exécution.

## Maturité

- #639 est une fondation interne uniquement : aucune API Gaming, aucun workspace et aucune navigation utilisateur Gaming ne sont activés.
- Aucun statut `READY` ou `COMMERCIAL_READY` n'est revendiqué par ce lot.
- `OWNER_E2E` n'est pas requis pour #639 puisqu'aucune surface utilisateur n'est rendue ; il devient obligatoire sur les lots fonctionnels et avant la readiness commerciale finale #646.

## Rollback

- Retirer la classification, le registre et les helpers applicatifs si le lot doit être annulé.
- Si la migration additive a déjà été appliquée, conserver les tables inutilisées plutôt que supprimer ou réécrire des données.
- Aucune migration historique, donnée financière existante ou donnée métier d'un autre domaine n'est réécrite par #639.
