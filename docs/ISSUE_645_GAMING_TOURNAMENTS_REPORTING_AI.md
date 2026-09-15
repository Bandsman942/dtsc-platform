# Gaming Lounge 7/8 — Issue #645

## Périmètre livré

Cette itération active les trois derniers blocs opérationnels prévus par #645 pour le sous-type `GAMING_LOUNGE` :

- `GAMING_DASHBOARD` — vue d’ensemble Gaming ;
- `GAMING_TOURNAMENTS` — tournois et événements ;
- `GAMING_REPORTS` — rapports Gaming via le framework `EnterpriseReport` commun ;
- `ERP_GAMING_PERFORMANCE_READ` — lecture DTSC AI strictement factuelle et limitée par les permissions courantes.

Le socle #639–#644 reste la source de vérité pour les postes Gaming, sessions, réservations, tarification, encaissement et clôture quotidienne.

## Sources canoniques

#645 n’introduit aucun référentiel parallèle :

- participants et clients : `EnterpriseBusinessParty` / CRM ;
- postes matériels : `EnterpriseAsset` ;
- incidents et maintenance : domaine `ASSETS_MAINTENANCE` ;
- prestations et droits d’entrée : `EnterpriseCatalogItem` ;
- facturation : `EnterpriseSalesInvoice` ;
- paiements et trésorerie : flux Finance existants ;
- rapports : `EnterpriseReport`.

Les tables Gaming ajoutées par #645 sont uniquement opérationnelles : tournoi, inscription, affectation de poste et historique de transition.

## Tournois

Le module `GAMING_TOURNAMENTS` permet :

- création de tournoi avec format, fenêtre d’inscription, dates et capacité ;
- inscription d’un client CRM ;
- droit d’entrée optionnel basé sur un service du catalogue ;
- création de facture par le flux Finance commun avec approbateur autorisé ;
- check-in, retrait, disqualification et saisie du résultat ;
- affectation d’un poste Gaming sur un créneau ;
- contrôle des conflits avec réservations, sessions actives, incidents et maintenance ;
- cycle d’état audité jusqu’à la clôture/archivage.

## Maintenance intégrée

Gaming ne crée pas de table de maintenance parallèle. Les écrans Gaming utilisent des deep-links vers `ASSETS_MAINTENANCE` et la disponibilité d’un poste tient compte des incidents et maintenances de l’actif canonique.

La création d’un incident depuis le parc Gaming continue d’écrire dans l’API Actifs existante.

## Dashboard

Le dashboard expose notamment :

- nombre et état des postes ;
- sessions actives ;
- heures facturables terminées sur la période ;
- occupation courante ;
- réservations et taux d’absence ;
- tournois actifs ;
- incidents et maintenances si l’utilisateur possède l’accès Actifs ;
- facturation, reste à recevoir et panier moyen si l’utilisateur possède l’accès Finance.

### Règle multidevise

Les montants sont toujours groupés et affichés par devise. Les montants CDF et USD ne sont jamais additionnés dans un total commun sans base de change explicite. Aucun `exchangeRate` implicite n’est appliqué dans #645.

## Rapports

`GAMING_REPORTS` génère des snapshots dans `EnterpriseReport` avec `sourceModule = GAMING_REPORTS` :

- `GAMING_STATION_UTILIZATION` ;
- `GAMING_REVENUE` — facturation Gaming par devise ;
- `GAMING_OFF_PEAK` ;
- `GAMING_INCIDENTS_MAINTENANCE` ;
- `GAMING_BOOKINGS_NO_SHOW`.

Le listing respecte la visibilité du framework `REPORTS`. L’export CSV utilise la route commune `/api/enterprise/[organizationId]/reports/[id]/export`.

Un rapport financier nécessite en plus l’accès `FINANCE_RECEIVABLES`. Un rapport incidents/maintenance nécessite l’accès `ASSETS_MAINTENANCE`. Ces droits ne sont jamais élargis par le module Gaming.

## DTSC AI

L’outil `ERP_GAMING_PERFORMANCE_READ` :

- fonctionne uniquement en contexte `ORGANIZATION` ;
- exige `GAMING_DASHBOARD`, le plan requis et `ENTERPRISE_AI.TOOLS.READ` via le registre IA ;
- vérifie de nouveau l’accès Gaming dans son exécuteur ;
- n’inclut Actifs ou Finance que si les permissions de l’utilisateur les autorisent ;
- ne crée ni ne modifie aucune donnée ;
- sépare les devises ;
- expose la politique `FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE` ;
- ne doit jamais inventer une causalité à partir de corrélations opérationnelles.

## Sécurité et isolation

Toutes les requêtes Gaming #645 utilisent `organizationId`, la session active, les capacités de module et les permissions de domaine associées. Les mutations appliquent les protections existantes : same-origin, validation Zod, rate limiting, audit et API logs selon le flux concerné.

Un identifiant CRM, Actif, Catalogue ou Finance provenant d’une autre organisation doit être refusé côté serveur.

## QA automatisée

Le contrat ciblé est `scripts/qa-645-gaming-tournaments-reporting-ai.mjs`. Il couvre statiquement :

- activation des modules #645 ;
- persistence additive des tournois ;
- absence de référentiels Gaming parallèles pour client/paiement/actif ;
- frontières Actifs/Finance ;
- règle multidevise ;
- usage d’`EnterpriseReport` ;
- présence des workspaces ;
- outil DTSC AI read-only et factualité.

La régression #644 reste exécutée via un adaptateur de compatibilité afin de conserver tous ses contrôles historiques tout en levant uniquement son ancienne assertion voulant que les modules #645 restent `PLANNED`.

## Checklist OWNER_E2E

État actuel : **OWNER_E2E requis, non encore exécuté**.

1. Ouvrir une entreprise `HOSPITALITY_EVENTS` / `GAMING_LOUNGE` avec plan compatible.
2. Vérifier que Dashboard, Tournois et Rapports apparaissent uniquement pour les utilisateurs autorisés.
3. Créer un tournoi gratuit, ouvrir les inscriptions, inscrire un client CRM, affecter un poste, démarrer, saisir un résultat et terminer.
4. Créer un tournoi payant avec un service Catalogue et vérifier la facture Finance ainsi que le statut de paiement sans table Gaming parallèle.
5. Vérifier qu’un poste ayant un incident critique ou une maintenance en cours ne peut pas être affecté au tournoi.
6. Depuis Gaming, ouvrir l’actif lié dans `ASSETS_MAINTENANCE` et vérifier l’historique réel.
7. Générer chacun des cinq rapports puis exporter le CSV depuis le framework commun.
8. Avec données CDF et USD, vérifier l’absence de total mélangé et l’affichage séparé par devise.
9. Avec un utilisateur privé d’accès Finance, vérifier que le dashboard et DTSC AI n’exposent aucun montant financier.
10. Avec un utilisateur privé d’accès Actifs, vérifier que les incidents/maintenance sont masqués.
11. Demander à DTSC AI un résumé de performance Gaming et vérifier que la réponse reste factuelle, sans causalité inventée.
12. Vérifier FR/EN, mobile 320–414 px, tablette, desktop, mode clair/sombre et navigation clavier.
13. Vérifier qu’un utilisateur d’une autre organisation ne peut lire ni muter tournoi, rapport ou dashboard du tenant testé.

## Rollback

- désactiver les trois modules #645 dans le registre si une régression produit est détectée ;
- conserver la migration additive et les données tournoi pour éviter toute perte ;
- revenir aux modules #639–#644 sans supprimer les objets créés ;
- aucun rollback ne doit supprimer directement des données Finance, CRM ou Actifs.
