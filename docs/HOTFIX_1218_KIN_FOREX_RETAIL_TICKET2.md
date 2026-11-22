# Hotfix #1218 — KIN FOREX ticket 2 (RETAIL transverse)

## État
Branche de correctif `fix/1218-kin-forex-retail-documents-pos-stocks`. Ne pas fusionner avant CI et retour E2E propriétaire « BON ». Aucune preview Vercel ni déploiement manuel.

## Lot 1 — Encaissement POS
Le montant dû dépend uniquement du calcul serveur de l'ensemble du panier : quantité × prix, remises, taxes et conversion Finance. Le champ « Espèces reçues » suit le total seulement tant qu'aucune saisie manuelle n'a été faite. Toute modification du panier invalide l'ancien aperçu avant de permettre la confirmation. Un bouton réinitialise l'argent reçu au total exact; une configuration entreprise/boutique permet de proposer le total ou une saisie vide. Le montant comptabilisé reste exclusivement le total vérifié serveur et non le billetage reçu. Reprise idempotente et flux Finance existants inchangés.

## Lot 2 — Documents officiels
Dans « Administration entreprise → Paramètres entreprise → Mode RETAIL », un administrateur autorisé saisit après step-up MFA/mot de passe les éléments juridiques : dénomination, nom commercial, RCCM, ID.NAT, NIF, adresse, téléphone, email, site internet. Les identifiants légaux sont communs à la personne morale, jamais remplacés depuis une boutique. Nom commercial, téléphone, email et adresse de contact peuvent être surchargés boutique par boutique.
La facture Retail émise utilise un snapshot d'identité et de mentions figé lors de sa préparation. Migration additive `invoiceHeaderSnapshot`. Anciennes factures sans snapshot utilisent l'identité organisation/boutique actuelle à titre de fallback de compatibilité (elles ne reçoivent pas rétroactivement de numéros jamais enregistrés). A4 et thermique 80mm conservent leurs spécificités; escaping des champs légaux. Les obligations fiscales nationales nécessitent vérification juridique selon le pays; aucun numéro inventé ni masque d'obligation légale.

## Lot 3 — Rapport de stocks
Dans RETAIL_DAILY_CLOSE, nouvelle section « Rapport journalier des stocks ». Le rapport est généré depuis le journal commun immuable `EnterpriseStockMovement`, en calculant les bornes calendaires locales par boutique :
- Stock initial = Σ entrées − Σ sorties antérieures au début de journée.
- Entrées = Σ mouvements IN de la journée.
- Ventes = Σ sorties `SALE_FULFILLMENT` de la journée (facture en attente non livrée exclue).
- Autres sorties = Σ sorties hors ventes, incluant pertes, transferts, ajustements.
- Stock final = initial + entrées − ventes − autres sorties.
- Réservations/disponible = projection actuelle, affichée seulement pour la journée courante; pas de fausses réservations historiques.
- Lots/péremption facultatifs : métadonnées des lots actuels de la boutique, pas photographie historique.
Les exports CSV et XLSX englobent tous les articles de la boutique jusqu'à la borne explicite de 5 000 articles, alors que l'aperçu est paginé serveur 50 par page. Le format imprimable A4 paysage propose « Imprimer / Enregistrer en PDF » via le navigateur (pas de moteur PDF natif).
Les clés de site, les droits RETAIL_DAILY_CLOSE, la visibilité de stock par boutique et les quotas export sont revalidés côté serveur. Aucun second solde d'inventaire n'est écrit.

## Périmètre et limites visibles
Le présent hotfix est *une branche en validation*. Il ne doit jamais être présenté comme déployé ou validé E2E avant les vérifications.
La génération d'une **archive officielle immuable du rapport au moment de l'approbation de clôture** et son workflow d'approbation distinct ne sont pas livrés dans cette première branche; l'état courant est un rapport recalculé en consultation à partir des mouvements canoniques. Une extension ultérieure est nécessaire si le client exige le gel/les révisions de pièces d'inventaire à la clôture; le simple bouton PDF ne vaut pas archive scellée.
Le rapport est par boutique sélectionnée afin de respecter les fuseaux; un rapport multi-boutiques exige une consolidation explicite des jours locaux.
Les documents de vente hors circuit Retail (factures communes et pro-forma POS) devront être connectés au même référentiel d'identité avant d'annoncer une harmonisation trans-sectorielle totale.

## Sécurité et audit
Paramètres versionnés sur `EnterpriseRetailConfiguration.revision`, verrou pessimiste et Zod strict. Mutations step-up et audit HIGH. Impression et rapport sous contrôle organisation et site. Aucun duplicata comptable et aucune écriture stock depuis le reporting.

## Livraison
Vérifier `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:retail-kin-forex-ticket2-1218`, `pnpm qa:regression`, `pnpm build` et Quality Gates. Présenter au propriétaire le script E2E détaillé; attendre « E2E final #... BON » avant fusion. Production depuis main uniquement.
