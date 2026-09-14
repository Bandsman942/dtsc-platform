# Changelog — Gaming Pricing #643

## Livré

- `GAMING_PRICING_PACKAGES` passe en `BETA` avec route et workspace dédiés.
- Les offres Gaming réutilisent `EnterpriseCatalogItem` actif de type `SERVICE` ; aucun catalogue Gaming parallèle n’est créé.
- Les devises sont validées par le service Finance canonique `assertEnterpriseCurrencyActiveTx`.
- Quatre modes serveur sont supportés : `FIXED_DURATION`, `PER_MINUTE`, `PER_HOUR`, `PACKAGE`.
- Les règles peuvent cibler poste, famille de console, nombre de joueurs, jour, plage horaire, durée et période de validité.
- La résolution est déterministe : priorité, spécificité puis code/id.
- La simulation tarifaire n’écrit ni vente, ni facture, ni paiement, ni trésorerie.
- Le démarrage manuel d’une session fige `pricingRuleId`, `pricingSnapshotJson`, `currency` et `quotedAmount` dans la même transaction que `START` lorsqu’un service Catalogue est choisi.
- La conversion `GAMING_BOOKINGS → GAMING_SESSIONS` exige désormais un service Catalogue, simule le tarif avant démarrage dans l’UI, puis résout et snapshotte le prix dans la même transaction que la conversion ; aucune session nouvellement convertie n’est créée sans tarif.
- La date de simulation est réellement optionnelle : si elle est absente, le serveur utilise l’heure courante au lieu d’une coercition vers l’époque Unix.
- La fin de session calcule `finalAmount` depuis le snapshot et le temps facturable, sans relire le tarif courant.
- Les dérogations de prix exigent `enterprise.gaming.pricing.manage`, un motif et un audit.
- L’administration Pricing, le formulaire Sessions et la conversion des Réservations sont FR/EN et mobile-safe.
- `qa-643-gaming-pricing.mjs` est raccordée à `qa:regression` et protège aussi le chemin réservation → session tarifée.

## Non livré dans #643

- vente/créance ;
- facture/reçu ;
- paiement ;
- caisse, banque ou Mobile Money ;
- clôture quotidienne ;
- rapprochement de trésorerie.

Ces flux appartiennent à #644 et devront réutiliser les domaines Finance communs.

## Compatibilité

Les sessions antérieures sans snapshot restent valides et affichent simplement des montants absents. Toute nouvelle session tarifée — démarrée directement ou issue d’une réservation — conserve son historique même si la règle Pricing est ensuite modifiée, désactivée ou archivée.
