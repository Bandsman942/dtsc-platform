# Guide utilisateur — Abonnement
> **Contrat de guide DTSC v2** — Catalogue publié, limites réelles, permissions serveur et parcours mobile.

## Objectif

Le module **Abonnement** permet de comprendre l’offre réellement appliquée à votre compte ou à votre organisation, ses limites et son état de facturation.

La page publique **Tarifs** (`/tarifs`), le module **Abonnement**, la Console DTSC et les assistants IA utilisent désormais le même catalogue commercial publié.

## Trois notions à distinguer

### Offre commerciale

C’est le package que vous voyez et souscrivez : par exemple **Individuel Professionnel**, **Organisation Essentielle**, **Organisation Croissance** ou **Organisation Premium**.

### Abonnement

C’est l’instance qui relie votre compte ou votre organisation à une offre, avec son statut, sa période, son essai éventuel et son expiration.

### Niveau de capacité

DTSC Platform dérive ensuite un niveau **Essentiel**, **Professionnel** ou **Entreprise** pour appliquer les règles techniques. Ces niveaux ne remplacent jamais le nom de l’offre commerciale visible par le client.

## Offres personnelles

La release commerciale 2026.09 conserve quatre offres individuelles :

| Offre | Prix mensuel de référence | Messages IA / jour | Tokens / jour | Sources IA |
| --- | ---: | ---: | ---: | ---: |
| Découverte individuelle | Gratuit | 5 | 15 000 | 1 |
| Individuel Essentiel | 2 USD | 40 | 120 000 | 2 |
| Individuel Professionnel | 15 USD | 200 | 750 000 | 20 |
| Individuel Premium | 50 USD | 1 000 | 3 000 000 | 100 |

Les offres personnelles se différencient principalement par les volumes de l’assistant IA et le nombre de sources de connaissance utilisables.

Les valeurs réellement affichées sur `/tarifs` et `/billing` viennent du catalogue administré courant. Si DTSC publie plus tard une nouvelle révision, ces pages n’utilisent pas une ancienne copie codée en dur.

## Offres organisation

### Organisation Essentielle — 25 USD/mois de référence

Pensée pour **structurer et collaborer** :

- jusqu’à 10 utilisateurs ;
- 5 Go de stockage ;
- 300 minutes d’appels collaboratifs par mois ;
- jusqu’à 12 modules actifs ;
- 1 000 documents métier ;
- 50 sources de connaissance IA avec la valeur de référence actuelle ;
- administration entreprise de base ;
- collaborateurs, postes, départements et permissions de base ;
- demandes internes, documents, rapports, clients/tiers, catalogue, projets & services ;
- calendrier et appels collaboratifs ;
- IA Assistant Entreprise en **lecture, recherche, résumé et analyse**.

Le mode Agent de l’IA Entreprise reste limité aux outils de lecture dans cette offre.

### Organisation Croissance — 75 USD/mois de référence

Pensée pour **gérer et automatiser** :

- jusqu’à 50 utilisateurs ;
- 50 Go ;
- 3 000 minutes d’appels par mois ;
- jusqu’à 60 modules actifs ;
- 20 000 documents métier ;
- 250 sources IA avec la valeur de référence actuelle ;
- tout le socle Essentiel ;
- tâches, validations, réunions et workflows ;
- CRM, ventes, contrats, fournisseurs, achats, sites, stocks et logistique ;
- RH, temps & présences, temps & livrables, actifs & maintenance ;
- finances opérationnelles selon les modules disponibles ;
- IA Entreprise pouvant **préparer des actions** lorsque votre rôle et vos permissions l’autorisent.

Une préparation IA n’est pas une exécution automatique : les contrôles et confirmations du module restent applicables.

### Organisation Premium — 180 USD/mois de référence

Pensée pour **piloter, comptabiliser et sectorialiser** :

- jusqu’à 500 utilisateurs ;
- 500 Go ;
- 30 000 minutes d’appels par mois ;
- jusqu’à 250 modules actifs ;
- 250 000 documents métier ;
- 1 000 sources IA avec la valeur de référence actuelle ;
- tout le socle Croissance ;
- paie opérationnelle ;
- banque, rapprochement, comptabilité, fiscalité, clôture et états financiers ;
- finance des actifs et inventaire ;
- capacités sectorielles avancées Health/Pharmacy lorsque le secteur est concerné ;
- mode Agent avancé, toujours soumis aux permissions, confirmations et règles métier.

## Comprendre les limites affichées

Trois compteurs sont volontairement séparés.

### Sources de connaissance IA

Fichiers et sources utilisés par les assistants IA pour rechercher, résumer ou analyser des informations autorisées.

### Documents métier

Pièces opérationnelles de l’ERP : factures, contrats, documents de processus et autres documents métier. Leur plafond est indépendant des sources IA.

### Stockage

Capacité globale de stockage. Un espace peut donc avoir une limite de documents métier, une limite de sources IA et une limite de stockage différentes.

## Offre appliquée selon le contexte

- **Compte personnel** : l’offre vient de votre abonnement personnel actif ou, à défaut, de l’offre gratuite Découverte.
- **Organisation cliente** : l’offre vient uniquement de l’abonnement de l’organisation active. Votre offre personnelle ne remplace jamais celle de l’entreprise.
- **DTSC interne** : les capacités internes restent séparées des abonnements clients.

Il est normal d’avoir une offre personnelle Découverte tout en travaillant dans une organisation Premium.

## IA et catalogue commercial

### Assistant du site public

L’assistant public peut expliquer les abonnements DTSC Platform et citer leurs tarifs uniquement depuis le catalogue publié courant. Il distingue ces abonnements d’un devis de conseil, développement, intégration ou formation.

### Chatbot général connecté

Le chatbot général peut expliquer DTSC Platform et son catalogue. Il ne lit pas les données ERP de votre entreprise active.

### IA Assistant Entreprise

L’IA Entreprise reçoit l’offre et les limites effectives de l’organisation, mais l’abonnement n’accorde jamais à lui seul l’accès aux données.

Le serveur vérifie toujours le contexte d’organisation, le rôle, les permissions, les modules, le secteur et les outils réellement disponibles.

Selon l’offre :

- **Essentielle** : outils de lecture uniquement ;
- **Croissance** : lecture + préparation d’actions ;
- **Premium** : lecture + préparation + modes d’action avancés autorisés.

Une action sensible reste soumise aux confirmations et règles du module concerné.

## Statuts et facturation

Les statuts peuvent notamment indiquer qu’un abonnement est actif, en essai, en attente de paiement, en retard, annulé ou expiré selon la situation réellement enregistrée.

Les factures présentées dans **Abonnement** concernent l’abonnement SaaS DTSC Platform. Elles sont distinctes des factures clients, fournisseurs et pièces comptables de l’ERP.

La référence, le fournisseur, le montant, la devise, le statut et la date du paiement sont affichés lorsqu’ils existent.

## Changer d’offre

Une action de paiement ou de changement n’est affichée que lorsque le fournisseur de paiement correspondant est réellement configuré.

Pour une organisation :

- seules les offres organisation peuvent être sélectionnées ;
- seuls les rôles autorisés peuvent gérer l’abonnement ;
- une modification d’offre peut entraîner une réconciliation des modules éligibles ;
- les données historiques des modules désactivés ne doivent pas être supprimées par un simple changement de package.

## Console DTSC et révision du catalogue

La Console DTSC affiche l’identifiant de release/révision du catalogue et distingue :

- prix et quotas de l’offre ;
- niveau de capacité ;
- sources de connaissance IA ;
- documents métier ;
- stockage ;
- mode IA ;
- modules inclus par le niveau.

Les changements administrés d’une offre sont historisés par le mécanisme de versions de plans existant.

## Accès et permissions

Une fonctionnalité incluse commercialement peut rester inaccessible à un utilisateur précis si son rôle ou ses permissions ne l’autorisent pas.

Le frontend n’est jamais une barrière de sécurité. Les routes serveur revalident le tenant, le membership, le module, l’entitlement, la permission et les références utilisées par l’action.

## Dépannage

Si l’offre d’une organisation ne correspond pas à celle attendue :

1. vérifiez le contexte d’organisation actif ;
2. ouvrez **Abonnement** et consultez **Abonnement de l’organisation active** ;
3. vérifiez le statut et la période ;
4. comparez la release du catalogue affichée avec `/tarifs` ;
5. si un module reste refusé, vérifiez son activation et vos permissions ;
6. contactez le support DTSC en conservant le message d’erreur, sans partager de donnée sensible.

Si l’IA indique qu’un outil n’est pas autorisé, cela ne signifie pas nécessairement que l’offre est incorrecte : la permission de l’utilisateur, le module actif, le secteur ou une confirmation métier peuvent aussi limiter l’action.
