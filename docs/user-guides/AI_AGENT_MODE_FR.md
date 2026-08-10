# Guide utilisateur — Mode Agent DTSC

## À quoi sert le mode Agent ?

Le mode Agent permet de confier à DTSC AI une tâche en plusieurs étapes tout en conservant des limites serveur, les permissions de votre compte et une validation humaine pour les actions qui modifient des données.

Il est disponible dans le Chatbot global et dans l’Assistant IA Entreprise depuis le bouton **Mode agent**.

## Démarrer un run

1. Ouvrez **Mode agent**.
2. Décrivez l’objectif à atteindre, pas une suite d’instructions techniques.
3. Lancez l’agent.
4. Suivez l’état, les étapes utiles, les outils utilisés, les tokens et le coût estimé.

L’agent n’affiche jamais sa chaîne de pensée privée. Les étapes visibles sont uniquement des traces d’exécution auditables.

## Outils et données

L’agent ne voit que les outils déjà autorisés pour votre utilisateur, votre organisation, votre plan et le contexte actif. Chaque appel repasse par le DTSC Tool Gateway.

Dans l’Assistant Entreprise, le contexte d’organisation est relu depuis votre session active. Une demande ne peut pas choisir librement un autre tenant.

Les documents RAG/CAG et résultats d’outils sont traités comme des données, jamais comme des instructions capables de contourner les règles DTSC.

## Validation d’une action

Lorsqu’une mutation exige une validation :

1. le run passe à **Validation requise** ;
2. vérifiez l’action et son aperçu ;
3. choisissez **Valider** ou **Refuser** ;
4. après validation réussie, choisissez **Reprendre après validation** pour continuer le même run.

Écrire « oui », « ok », « vas-y » ou une phrase équivalente dans le chat ne valide jamais une mutation.

Un refus ferme le run suspendu. Une action déjà confirmée et exécutée reste réelle et auditée même si le run est ensuite annulé.

## Annuler

Utilisez **Annuler** pour arrêter un run actif ou suspendu. L’annulation est transmise au runtime et au provider lorsque celui-ci est encore en cours d’exécution.

## Limites et domaines sensibles

Le nombre d’étapes, d’outils, de tokens, le coût estimé et la durée active sont plafonnés côté serveur selon le plan et les classifications de données.

Pour les domaines Health, Finance, RH et Legal sensibles, l’agent est limité aux usages de lecture et de préparation. Il ne peut pas prendre seul une décision clinique finale, effectuer un paiement ou une écriture comptable, décider d’une paie/sanction RH ou engager juridiquement l’entreprise.

## En cas d’erreur

- **Limite atteinte** : réduisez la tâche ou démarrez un nouveau run plus ciblé.
- **Action non autorisée** : vérifiez votre rôle, le contexte actif et les modules accessibles.
- **Validation expirée** : redemandez à l’agent de préparer l’action.
- **Provider indisponible** : réessayez lorsque le service IA est disponible ; ne contournez pas les politiques avec une action métier directe non prévue.

## Bonnes pratiques

- Donnez un objectif clair et vérifiable.
- Contrôlez les citations et résultats métier avant décision.
- Utilisez les outils de mutation uniquement lorsqu’ils sont réellement nécessaires.
- Annulez un run qui part dans une direction inutile plutôt que d’augmenter ses limites.
- Pour une information ou action importante, vérifiez toujours la source métier canonique.
