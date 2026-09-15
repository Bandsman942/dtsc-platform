# Guide utilisateur — Salle de jeux / Gaming Lounge

**Contrat de guide DTSC v2**

## Objectif et périmètre

`HOSPITALITY_EVENTS -> GAMING_LOUNGE` permet d’exploiter une salle de jeux, consoles et activités e-sport sans créer de référentiels parallèles. Les clients restent dans CRM, les services dans Catalogue, les sites dans Sites, les PlayStation/TV/manettes/onduleurs dans Actifs & maintenance, les paiements/comptes dans Finance, les produits physiques dans Inventory et les rapports dans le framework Reports commun.

Le domaine Gaming ajoute uniquement les concepts propres au métier : profil de poste lié à un actif, session minutée, réservation, règle tarifaire, checkout lié aux objets Finance, clôture Gaming, tournoi et projections analytiques.

## Mise en service en huit étapes

Depuis **Vue d’ensemble Gaming**, la carte **Mise en service Gaming Lounge** vérifie les données réelles de l’entreprise. Elle ne crée pas silencieusement les référentiels communs.

1. **Identité & site** : renseignez l’identité de l’entreprise et sélectionnez le site opérationnel.
2. **5 postes & actifs** : le scénario de lancement demande cinq postes associés à cinq actifs canoniques. Cinq n’est jamais une limite du produit : le même flux permet d’ajouter une sixième station et les suivantes.
3. **Équipe & permissions** : utilisez les postes recommandés Gérant/Admin Gaming, Caissier/Opérateur, Technicien et Finance/Comptable. Les permissions sont explicites et ne donnent aucun bypass global.
4. **Services du catalogue** : créez les offres de temps de jeu comme services du Catalogue commun.
5. **Tarifs & forfaits** : configurez une ou plusieurs règles Gaming. Le calcul et le snapshot tarifaire sont effectués côté serveur.
6. **Finance & paiements** : finalisez la readiness Finance et configurez au moins un compte financier actif. Aucun compte ou tender Gaming parallèle n’est créé.
7. **Réservations, sessions & checkout** : vérifiez que les modules opérationnels sont activés et accessibles selon le plan et les permissions.
8. **Clôture, rapports & DTSC AI** : utilisez la clôture journalière, le dashboard, les rapports, les tournois et l’IA autorisée pour terminer le parcours de pilotage.

## Opérations quotidiennes

### Postes de jeu

Un poste Gaming étend un `EnterpriseAsset`. Créez d’abord l’actif dans **Actifs & maintenance**, puis associez-le dans **Postes de jeu**. Les incidents et maintenances majeures rendent le poste indisponible selon les règles du domaine. L’archivage Gaming ne supprime jamais l’actif ni son historique.

### Réservations et sessions

Une réservation peut être brouillon, confirmée, enregistrée à l’arrivée, marquée no-show, annulée ou convertie en session. Les conflits de créneaux sont contrôlés côté serveur. La conversion réservation → session est idempotente.

Les sessions utilisent les timestamps serveur. Le navigateur n’est jamais l’autorité du chronomètre. Une station ne peut pas avoir deux sessions live incompatibles. Pause, reprise, prolongation, transfert et fin suivent des transitions contrôlées et auditées.

### Tarification

Les règles Gaming référencent des services actifs du Catalogue. Elles peuvent tenir compte de la durée, du poste, d’un forfait, du jour et du créneau. La règle appliquée, la devise et les paramètres utiles sont snapshotés pour conserver l’explicabilité historique. Une dérogation tarifaire exige permission et motif.

### Checkout et clôture

Une session terminée devient encaissable via les objets commerciaux et financiers communs. Cash, Mobile Money, banque et paiements mixtes utilisent les comptes Finance autorisés. Les retries ne doivent créer ni double vente ni double paiement.

La clôture Gaming compare les sessions et encaissements par devise et par moyen de paiement. CDF, USD ou toute autre devise restent séparées tant qu’aucune conversion FX explicite n’est fournie.

### Incidents et maintenance

Depuis une station ou une session, utilisez le raccourci vers **Actifs & maintenance**. Dans `Activités [Entreprise]`, les blocs **Signaler une panne Gaming** et **Demander une maintenance** ouvrent le domaine Actifs canonique ; ils ne créent pas une seconde table de maintenance Gaming.

### Tournois et rapports

Les participants identifiés viennent du CRM commun. Les éventuels frais d’entrée passent par Finance. Les rapports Gaming sont créés dans `EnterpriseReport` et peuvent couvrir utilisation des postes, revenus par devise, périodes creuses, incidents/maintenance et réservations/no-show.

## DTSC AI

L’Assistant IA entreprise peut résumer les performances Gaming uniquement à partir des sources que l’utilisateur a déjà le droit de lire. L’outil `ERP_GAMING_PERFORMANCE_READ` est en lecture seule. Il ne contourne ni le plan, ni les modules, ni les permissions, ni les droits Finance/Actifs. Il présente des observations factuelles et ne transforme pas une corrélation en causalité.

## Accès, rôles et sécurité

Les rôles Gaming recommandés servent de point de départ. Un poste n’obtient que les permissions explicitement provisionnées. Un rôle DTSC global ne donne aucun accès automatique aux données privées d’un tenant Gaming Lounge.

Toutes les mutations sensibles suivent les contrats DTSC : organisation active, membership, sous-secteur compatible, module actif, entitlement, permission, same-origin, validation Zod, rate limit, révision/idempotence et audit selon le flux.

## Readiness commerciale

`COMMERCIAL_READY` n’est pas une déclaration marketing automatique. Le statut est admissible uniquement sur le head final ayant passé la CI et après `OWNER_E2E` du parcours : création DTSC → invitation → onboarding → 5 postes → réservation → session → paiement → clôture → panne/maintenance → rapport/IA.

Le produit doit rester utilisable en FR/EN, clair/sombre, mobile 320/360/375/390/414, tablette et desktop.

## Dépannage

- **La checklist reste incomplète** : ouvrez le lien de l’étape et complétez la donnée dans son module canonique.
- **Un poste n’apparaît pas** : vérifiez l’actif, son organisation, son statut et l’absence d’un profil Gaming déjà lié.
- **Une session refuse de démarrer** : vérifiez disponibilité, incident/maintenance, réservation concurrente et tarif applicable.
- **Le prix n’est pas trouvé** : vérifiez le service Catalogue, la devise et une règle active couvrant le créneau.
- **Le paiement échoue** : vérifiez la readiness Finance, le compte financier, la devise et les permissions.
- **La clôture affiche plusieurs devises** : c’est volontaire ; ne les additionnez pas sans taux FX explicite.
- **L’IA masque Finance ou Actifs** : l’utilisateur courant n’a pas les permissions correspondantes.
