# #1226 — Intégrité financière et rapprochement intelligent

**DRAFT — tranches A à E2 candidates, non certifiées, non fusionnables.** Aucune donnée client dans ce dépôt public.

## Contrat
- Le détail comptable utilise l'autorité de capacités commune aux listes. La mutation conserve les gardes serveur, séparation des acteurs, période et audit.
- Le deep link EnterpriseJournalEntry ouvre l'identifiant exact, pas une recherche paginée.
- Pour CASH, la clôture Retail affiche uniquement la session OPEN du caissier déjà résolue par le dashboard. Le solde affiché est openingAmount + entrées - sorties de session. Les comptes non cash restent distincts.
- La nouvelle soumission transmet cashSessionId et expectedSessionAmount ; le serveur revalide la session et le montant dans la transaction. Compatibilité temporaire des anciens clients sans ces champs.
- Posting CASH_VARIANCE_POSTED : dimension site provenant de la session ou du compte, conflit explicite si divergence. Aucune mutation des écritures historiques.
- **Non résolu par A** : qualification distincte avant posting, régularisation métier, passations, consolidation et rapprochements physiques/bancaires/opérateur, imports et suggestions, état jamais rapproché, refonte Design 2.0 et audit historique. Ces lots sont bloquants dans #1226.

## Recette obligatoire avant release
1. Deux caissiers, même compte : chacun voit son montant propre, y compris plusieurs comptes/devises et site différent. Session absente/fermée non sélectionnable.
2. Mouvement concurrent entre comptage et soumission : rejet 409 et nouvelle lecture. Aucune écriture du comptage périmé.
3. Clic KPI vers écriture exacte, hors pagination; identifiant d'un autre tenant refusé. Détail inaccessible affiche erreur.
4. Détail et liste retournent capacités cohérentes ; acteur initial ne peut pas contrepasser ; autorisé indépendant peut utiliser l'action sous gardes serveur. Vérifier révision pour transitions.
5. Écart réel, positif/négatif : site correct, conflit de site refusé ; ne pas altérer journal historique.
6. Restants : clôture sans posting non qualifié, correction tracée, rapprochement partiel/groupé/idempotent, imports privés XLSX/CSV, approbation indépendante, couverture et soldes datés, responsive 320–1024 FR/EN clair/sombre; non-régression Health/Pharmacy/Finance/Retail.
7. QA locale/CI, migrations, OWNER_E2E et revue : NOT_EXECUTED à ce stade.
Rollback avant fusion : abandon de la branche; après fusion suivre la procédure officielle de hotfix, sans supprimer d'historique.

## Tranche B1 — séparation du comptage et du posting (candidate)
- Approbation des clôtures Finance et Retail : les écarts passent à PENDING_QUALIFICATION sans posting automatique. Le détail de caisse indique la qualification en attente; le formulaire Retail précise le comportement. La commande de qualification et régularisation reste à implémenter. Aucun changement historique et aucune mutation production.
- QA ciblée étendue. La qualification, le rapprochement complet et E2E propriétaire restent bloquants.

## Tranche B2 — garde conservatoire du rapprochement (candidate)
- Verrou de session et cibles, relevé exact, période/devise/sens contrôlés; refus des montants partiels avant statut rapproché. Validation exige couverture du relevé et absence de transactions non rapprochées. Le rapprochement physique, partiel/groupé et historique reste bloquant : cette tranche ne constitue pas le moteur final.
- Trésorerie : distinguer jamais rapproché d'un vrai zéro; dernier rapprochement issu des sessions terminées, référence masquée sur la liste et nouvelles écritures de référentiel. Auditer les autres lecteurs historiques avant livraison.
- Aucun test exécuté localement. E2E propriétaire requis.

## Tranche C1 — suggestions exactes et régression #580
- Code d'erreur de dépassement du montant bancaire restauré sans autoriser le partiel. La QA spécifique #1226 entre dans qa:regression.
- Analyse lecture seule des candidats du compte/relevé/période, même référence exacte/date UTC/devise/sens/montant décimal, unicité dans les deux sens; aucun résultat si limite de 5000 dépassée. Confirmation explicite par le chemin canonique, actualisation; aucun moteur fuzzy, aucun posting automatique. Réconciliation partielle/groupée, historique, rapprochement physique, qualification et régularisation restent bloquants. Aucune preuve CI de ce SHA avant exécution.

## Tranche C2 — qualification et régularisation candidate
- Route dédiée avec approbation caisse + gestion comptable, step-up, contrôle du site et séparation des acteurs, révision et transaction sérialisable. Les justificatifs sont référencés par le validateur (pas de preuve documentaire automatisée). Une erreur de comptage vérifiée égale au théorique ne poste rien; une ancienne écriture unique prouvée issue de l’ancien moteur peut être contrepassée sans ajuster la trésorerie, avec attestation et historique. Une vraie différence qualifiée enregistre posting + ajustement de trésorerie atomiques. Le comptage original reste immuable, le statut de l’écart et l’événement d’audit documentent la régularisation. Une nouvelle variance postée ne peut pas être annulée isolément; son inverse de domaine et la preuve comptable/physique complète restent à certifier/implémenter. Les fonds identifiés suivent leurs circuits canoniques; l’interface de requalification capital/transfert reste à compléter.
- Liens source vers la session exacte, revue FR/EN. Aucun client ni donnée historique modifié. Tests PostgreSQL et navigateur du workflow requis avant livraison.

## Tranche D1 — allocations partielles et groupées candidates
- Une allocation positive par couple ligne/transaction, réessai identique idempotent, réservations exclusives à la session, verrous et somme décimale bornée. Plusieurs allocations permettent un rapprochement un-à-plusieurs et plusieurs-à-un; les états individuels ne deviennent complets qu'à couverture totale. La validation recontrôle les totaux réels de chaque ligne et transaction, y compris l'historique. Les propositions excluent les cibles déjà partiellement allouées. Interface affiche le reste de ligne et autorise le montant partiel. Les états de ligne/transaction suivent encore le cycle existant avant validation globale; une annulation d'allocation et la migration de réservations historiques restent à traiter.
- Journée des suggestions : date civile du relevé encodée UTC versus transaction dans le fuseau de l'entreprise résolu canoniquement. Pas de naïf ISO slice. Les tests de fuseau aux frontières de période, périodes datées et rapprochement physique restent requis.

## Tranche D2 — import bancaire XLSX candidat
- Modèle natif ExcelJS réimportable, colonnes canoniques, instructions et compte/devise facultatifs, aperçu serveur protégé (ZIP et types de cellule contrôlés), aucune persistance du fichier brut en prévisualisation. Le chemin existant CSV et l'import durable normalisé sont conservés. Aperçu paginé de toutes les lignes avant confirmation. Validation exacte des soldes, dates, ordre, sens et doublons référencés dans le schéma commun HTTP/worker et le service synchrone. Limite XLSX 2 Mo, 10 000 lignes; les gros fichiers devront être divisés si la limite de taille sûre est atteinte. Tests round-trip XLSX, import durable et browser encore requis.

- Compatibilité TypeScript : valeurs BigInt construites via BigInt() (pas de littéraux ES2020), contrat d'erreur import contextualisé. Validation CI requise.

## Tranches E1/E2 — comptage physique et soldes datés candidats
- Migration additive nullable physicalEvidenceJson, sans backfill ni changement des anciennes preuves. La caisse est rapprochée par comptage physique de tous les fonds, pas par addition des clôtures. Tous les dossiers de session et d'écart doivent être résolus. Attestation et référence du justificatif, instant serveur, révision du compte et empreinte des sessions, relecture transactionnelle à la soumission/validation, approbateur indépendant et step-up. Ce contrôle ne marque aucune transaction individuelle comme rapprochée. Justificatif référencé, non téléversé ni automatiquement authentifié.
- Relevés banque/opérateur : fenêtre civile du fuseau entreprise demi-ouverte incluant la journée finale; solde opérationnel reconstitué à la fin de période, cohérence vérifiée avec le solde courant et revalidation avant approbation. Les anciennes contrepassations dans le périmètre sans représentation de mouvement distincte bloquent la certification. Pas d'écrasement d'un rapprochement achevé plus récent.
- Restent bloquants : annulation/reprise d'un rapprochement physique périmé, annulation des allocations et passage de leur statut définitif à l'approbation globale, passation/custodie et consolidation des caisses, inverse métier d'un nouvel écart réel, audit historique et preuves de données, revue complète Design 2.0, recette PostgreSQL et navigateur (dont XLSX aller-retour et import durable), CI du dernier SHA et OWNER_E2E. Aucun accès ou changement de données client, aucune fusion et aucun déploiement.

## Tranche F — cycle des réservations candidat
Les allocations nouvelles sont RESERVED jusqu’à validation globale; le passage MATCHED/RECONCILED/CONFIRMED intervient atomiquement après preuve de couverture et indépendance. Annulation motivée par le préparateur autorisé d’un brouillon ou d’une allocation, sans effacement ni changement de solde. Les anciennes allocations CONFIRMED dans un brouillon bloquent la reprise automatique; elles nécessitent un audit. Paiement réservé ou lié à un rapprochement confirmé: interdiction de mutation isolée de rapprochement/contrepassation. Aucun changement historique ni preuve CI définitive.

## Tranche G — inverse métier et audit historique candidat
- Une qualification réelle erronée peut être annulée uniquement avec un nouveau comptage vérifié égal au théorique, un acteur indépendant de la qualification et de la clôture, un justificatif, un journal unique et un mouvement de trésorerie source exact. L’écriture de contrepassation et le mouvement inverse sont enregistrés atomiquement, sans supprimer le mouvement initial. Tout rapprochement ultérieur ou réservation bloque cette correction automatique; pas de requalification d’une entrée/sortie réelle ultérieure.
- `node scripts/audit-cash-reconciliation-1226.mjs --organization-id ID --from-date YYYY-MM-DD --to-date YYYY-MM-DD` : lecture seule PostgreSQL, périmètre obligatoire de 92 jours au plus, 2000 dossiers par entité, agrégats anonymisés. Ne pas exécuter sur production sans autorisation distincte; aucun audit de données réelles exécuté. Les corrections historiques ambiguës restent soumises à preuve et validation client séparée.

## Tranche H — prévention de double affectation (candidate)
- À l'ouverture, verrou du compte et fonds disponibles = solde opérationnel moins fonds théoriques des sessions actives; un comptage supérieur en attente reste réservé. Fonds négatifs et surplus demandé bloqués, aucun mouvement ni écriture à l'ouverture. Revue des données historiques et des fonds réellement détenus nécessaire; ne constitue pas une passation contradictoire. POS/Mobile Money affichent le solde de session, et non le solde global. Clôture Retail transmet également la révision de session (compatibilité API additive).
- Banc VM #1042 adapté aux nouvelles dépendances non concernées par son test de site; assertions existantes conservées et nouveaux tests d'affectation des fonds. Aucune CI finale encore prouvée.

## Tranche I — passation contradictoire candidate
- Entité tenant-scoped additive EnterpriseCashHandover et migration. Proposition par le caissier source, acceptation/refus par le caissier destinataire, annulation par le proposant; step-up et contrôle site/compte/acteur, révision, idempotence de proposition, sérialisation et contrôle de fonds à l'exécution. Deux mouvements de session opposés, aucun changement de trésorerie générale ni nouvelle écriture. Une passation non décidée interdit la clôture. Liste paginée et panneau FR/EN dans la caisse. Le justificatif est une attestation et référence saisie, pas une preuve téléversée. Ce flux exige deux sessions ouvertes du même compte; pas de transfert entre comptes ou magasins. Certification PostgreSQL et navigateur requise.

## Tranche I2 — compatibilité #700
Une nouvelle session reste possible quand la précédente attend validation, mais ses fonds restent réservés. Attestation explicite dans le schéma serveur de passation. Aucune recette finale.

## Tranche J — consolidation candidate
Consolidation propriétaire par boutique et devise, sessions validées distinctes et flux nets hors passations internes, sans addition des fonds comptés. Les flux sont ceux des sessions clôturées à la date métier, pas un inventaire global de la caisse; rapprochement physique séparé. La définition du KPI produits comptabilisés distingue ce total du chiffre d’affaires des ventes. La ventilation des ventes et autres produits par métriques distinctes et les exports correspondants restent à finaliser. Aucune validation finale.

## Recette automatisée ciblée (candidate)
`tests/e2e/issue-1226-financial-integrity.spec.mjs` est exécuté après la recette #662 dans son environnement PostgreSQL et Redis isolé, avec garde stricte CI/localhost/base jetable. Vérifie réellement ouverture, fonds réservés, deux acteurs, step-up, passation, fermeture bloquée, solde de session, absence de posting d'écart non qualifié, plusieurs tailles écran, aller-retour XLSX, solde daté, allocations partielles/groupées, annulation et approbation indépendante. Cette recette n'est pas le OWNER_E2E manuel et ne couvre pas encore tous les cas historiques ou secteurs. Aucun résultat anticipé.
