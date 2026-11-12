# Recette E2E de pré-fusion — RETAIL POS, issue #1116 / PR #1118

**Statut : À EXÉCUTER — non certifié, non validé par le propriétaire.**
**Baseline :** `main@c85b8f845a148bc3c9df64cdb5fc9d07b8e446c9` (recontrôler `origin/main` avant toute fusion).
**Branche candidate :** `fix/1116-retail-pos-five-lots`.
**Environnement :** branche locale isolée + base PostgreSQL de test migrée, données fictives; jamais Production ni données clients réelles. Les previews Vercel sont désactivées.

## Prérequis opposables

- Quality Gates + Shop2 behavioral + tous les checks obligatoires **verts sur le dernier SHA**; prouver `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:retail-five-lots-1116`, `pnpm qa:regression`, `pnpm build`, ainsi que les scénarios Playwright associés.
- Acteurs distincts : administrateur entreprise, gérant boutique A, gérant boutique B, préparateur/facturier boutique A, caissier A, valideur Finance, collaborateur sans permission, utilisateur d'une autre entreprise; tester sessions simultanées.
- Deux boutiques test, A « Gombe » et B « Limete », avec caisses, comptes financiers et entrepôts distincts; article sans lot, article à lots/FEFO, article en stock faible, service non stockable; devises CDF et USD indépendantes.
- Facturation Finance, créances, paiements, trésorerie, comptabilité et stocks activés et configurés selon leurs entitlements réels; règle fiscale configurée **uniquement à titre de test**, sans présumer sa conformité à la réglementation locale.
- Journaliser pour chaque scénario : référence facture, opération, caisse, site, acteur/permission, date/fuseau, devise, écritures `POSTED`, capture desktop/mobile et log anonymisé.

## Scénarios bloquants — lot 1 : hors connexion et resynchronisation

| ID | Action à exécuter | Résultat attendu |
|---|---|---|
| POS-01 | Ouvrir POS connecté A, préparer un snapshot autorisé, couper le réseau et préparer une vente Finance | Brouillon local chiffré et identifié A/utilisateur/navigateur; aucun paiement, aucune facture émise, aucune écriture `POSTED`, aucun stock consommé |
| POS-02 | Reconnecter et synchroniser deux fois le même UUID | Une seule facture Finance `DRAFT`, idempotence et accusé; aucune double vente ni double allocation |
| POS-03 | Changer prix/taxe/stock ou rendre le snapshot obsolète entre offline et sync | Conflit visible, aucune émission/encaissement silencieux, données conservées pour traitement |
| POS-04 | Retirer `PREPARE_INVOICE` puis rejouer un brouillon ancien | Serveur refuse; cache/snapshot ne confère aucun droit |
| POS-05 | Changer de compte ou boutique sur le même navigateur | Aucune donnée locale de A ni de son utilisateur n'est visible depuis B/autre compte; purge refusée tant que conflits/attentes existent |
| POS-06 | Recharger l'application complètement sans réseau, puis se reconnecter | Parcours offline sécurisé et récupérable **à prouver**; si le shell ne redémarre pas, **BLOCKER**, ne pas déclarer le lot achevé |
| POS-07 | Conflits simultanés multi-caissiers, réseau instable, quota IndexedDB, révocation, période Finance fermée | Pas de données perdues ni d'écriture comptable prématurée; erreurs métier traçables; reprise sûre |

## Scénarios bloquants — lot 2 : vente, Finance, remise, retour

| ID | Action à exécuter | Résultat attendu |
|---|---|---|
| POS-08 | Préparer facture CDF, soumettre, approuver, émettre, encaisser partiellement puis solder | Une facture canonique; paiement(s), allocation(s), créance, caisse, trésorerie et comptabilité concordants; pas de double comptage |
| POS-09 | Appliquer TVA configurée, remise par ligne, prix par canal/boutique/quantité | Prévisualisation = facture Finance = montant de paiement = écritures; ne jamais appliquer une promotion non traçable (rejet métier explicite tant que registre Finance absent) |
| POS-10 | Changer règle tarifaire depuis deux sessions | Révision obsolète rejetée 409; prix boutique A n'écrase pas B |
| POS-11 | Retour partiel/complet et avoir après paiement | Autorisation et pièce d'avoir; diminution de créance/remboursement exactement une fois; écriture de contrepassation si applicable; **BLOCKER** si l'unification retours Finance/legacy manque |
| POS-12 | Envoyer commande POS, WhatsApp manuelle et Online fictive avec origines distinctes | Origine et livraison séparées, statuts cohérents, zéro prétention de connecteur WhatsApp/e-commerce réel |

## Scénarios bloquants — lot 3 : stock et périphériques

| ID | Action à exécuter | Résultat attendu |
|---|---|---|
| POS-13 | Vendre article à lot/FEFO, périmé, proche péremption et stock insuffisant | Contrôle dans Inventaire canonique, lot valide exigé, WARN/BLOCK selon politique, justificatif; pas de gestion parasite dans formulaire Catalogue |
| POS-14 | Filtrer alertes de stock faible et péremption sur plus d'une page | Pagination/recherche serveur, dates exactes, filtres respectés; aucun site étranger |
| POS-15 | Configurer scanner, imprimante, tiroir et terminal selon permissions | Profil ≠ équipement connecté. Test clavier/scanner et impression système reproductibles; adaptateurs USB/Bluetooth/ESC-POS réellement testés **si déclarés supportés**; aucun faux statut « Prêt » |

## Scénarios bloquants — lots 4 et 5 : design, mise en service et sécurité

| ID | Action à exécuter | Résultat attendu |
|---|---|---|
| POS-16 | Parcourir factures, paiements, commandes, tarification, équipements, alertes, historique | Filtres période/date précise, recherche, pagination, menus « … », toasts, états vides/erreur, retour discret et actions réelles |
| POS-17 | Exporter CSV/XLSX/PDF après filtre et au-delà du plafond documenté | Données autorisées et concordantes; plafonnement à 5 000 visible, jamais troncature silencieuse; mise en page entreprise |
| POS-18 | Tester 320/360/375/390/414/768/1024 px + desktop, FR/EN, clair/sombre, clavier | Rien de masqué, pagination/formulaires accessibles, pas de débordement ni UUID/texte technique |
| POS-19 | Accéder aux boutiques/comptes d'autrui, désactiver un entitlement, falsifier siteId/organizationId | Refus serveur 403/404 approprié; aucun agrégat ou export inter-tenant |
| POS-20 | Mise en service : activer modules, sites, rôles, fiscalité, numérotation, appareils | Checklist précise; score Finance 15/15 ne prétend ni certifier matériel/offline ni réglementation d'un pays non vérifié |

## Preuves et décision de fusion

- Pour chaque ID : **PASS/FAIL/BLOCKED/NOT RUN**, acteur, date et build SHA, pièces comparées, captures anonymisées, incident lié.
- Tout FAIL de sécurité, idempotence, Finance, TVA, stock, multi-tenant, offline durable ou matériel annoncé compatible = **NON FUSIONNABLE**.
- Les fonctions non implémentées restent interdites ou clairement étiquetées; elles ne deviennent pas implicitement « PASS ».
- Validation finale exclusive : commentaire du propriétaire **« E2E final #1118 BON »**, après vérification des preuves et arbitrage formel de tout hors-scope. Cette phrase n'est **pas** encore reçue.
- Après validation seulement : résoudre chevauchements PR #1114/#1119, rejouer la CI sur base `main` actuelle, demander la fusion explicite; Production Vercel seulement depuis `main`.
