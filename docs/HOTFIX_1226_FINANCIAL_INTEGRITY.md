# #1226 — Intégrité financière et rapprochement intelligent

**DRAFT — tranche A, non certifiée, non fusionnable.** Aucune donnée client dans ce dépôt public.

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
