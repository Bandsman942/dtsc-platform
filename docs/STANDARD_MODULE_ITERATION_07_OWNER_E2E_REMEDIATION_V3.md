# Itération 7/8 — seconde remédiation E2E propriétaire

## Statut de livraison

Cette livraison consolide les constats E2E remontés après la première remédiation de l’itération 7. Elle reste soumise aux Quality Gates, à la migration additive, au build de production et à une nouvelle acceptation navigateur du propriétaire avant toute promotion commerciale.

## Prestations hebdomadaires

- Le Kanban peut être regroupé par mode de travail ou par type de travail.
- Chaque prestation journalière possède une vue plein écran avec résumé et commentaires autorisés entre déclarant et validateur.
- La soumission hebdomadaire possède une discussion globale distincte.
- Les commentaires utilisent le domaine opérationnel audité et les notifications existantes.

## Progression dérivée des opérations

- Les checklists et tâches liées constituent la source de vérité de la progression.
- La progression est recalculée côté serveur dans les transactions mutantes.
- Une opération ou un objet gouverné ne peut atteindre son statut de clôture tant qu’une tâche ou case reste ouverte.
- Les anciens champs de progression sont conservés pour compatibilité de lecture mais ne sont plus saisis manuellement dans les parcours concernés.

## Boîte à outils professionnelle

- Notes et pense-bêtes persistants, privés et multiples par utilisateur.
- Métadonnées de module, type, statut, priorité, étiquettes, ordre, épinglage et échéance.
- Liste compacte, Kanban filtrable et détail dédié.
- Éditeur riche stable avec actions de presse-papiers et repli clavier.
- Calculatrice standard, scientifique à analyse syntaxique sûre et financière avec aide contextuelle.

## Actions flottantes

Un registre global remplace les boutons superposés. Le bouton unique expose verticalement les actions pertinentes : boîte à outils, guide contextuel et navigation secondaire mobile. Le composant respecte les safe areas, le clavier et les zones de saisie.

## Abonnement, offres et IA

- Les offres individuelles et d’organisation sont présentées séparément avec une nomenclature uniforme.
- `BillingPlan` et ses versions sont la source de vérité des noms, prix et quotas.
- Le bootstrap du catalogue est centralisé dans `config/billing-plans.bootstrap.json`.
- Le chatbot résout ses quotas depuis l’abonnement actif du contexte, puis le plan gratuit, avec les anciens champs utilisateur uniquement comme repli de compatibilité.
- L’Assistant IA d’entreprise dérive ses plafonds mensuels de la même offre administrée.

## Mes Collaborateurs

- L’annuaire visuel liste les contacts acceptés et leur présence.
- La recherche globale par adresse exacte est réservée au rôle `ADMIN`; l’invitation porte l’étiquette `ADMIN DTSC`.
- Les autres rôles restent soumis au consentement et aux règles de découverte.
- Le chargement des anciens messages préserve l’ancrage de défilement et les messages restent dans le fil.

## i18n et guides

- Les interfaces corrigées possèdent leurs libellés FR/EN.
- Un inventaire global des libellés probablement codés en dur crée un budget de non-régression qui ne peut qu’être réduit.
- Tous les guides Markdown suivent le contrat DTSC v2 : objectif, accès, procédures spécifiques, statuts, sécurité et dépannage.
- Les audits i18n et guides sont exécutés dans les jobs Quality et Migration de la CI.

## Migration

`20260806110000_iteration_07_e2e_remediation_v3` ajoute uniquement `ProfessionalToolNote`, ses index et sa relation utilisateur. Aucune table ni colonne existante n’est supprimée ou réécrite.

## Sécurité

Les nouvelles mutations appliquent session, same-origin, validation Zod, limitation de fréquence, propriété utilisateur ou accès opérationnel, transaction lorsque nécessaire, ApiLog/AuditLog et notifications ciblées. Aucun rôle global ne contourne l’isolation des données d’une organisation cliente.
