# Guide utilisateur — Mode Agent DTSC
> **Contrat de guide DTSC v2** — Mode Agent interactif borné, interface FR/EN, permissions serveur, confirmation humaine, reprise et parcours mobile.

## Objectif et périmètre

Le **Mode Agent DTSC** permet de confier à DTSC AI une tâche en plusieurs étapes tout en conservant des limites serveur, les permissions du compte et une validation humaine pour les actions qui modifient des données. Il est disponible dans le **Chatbot global** et dans l’**Assistant IA Entreprise** depuis le bouton **Mode agent**.

Pour démarrer un run, ouvrez le panneau, décrivez le résultat attendu puis choisissez **Lancer l’agent**. Le panneau affiche l’état du run, les étapes utiles, les outils effectivement utilisés, les tokens et le coût estimé. Les étapes visibles sont des traces d’exécution auditables ; la chaîne de pensée privée du modèle n’est jamais affichée.

Le Mode Agent est un parcours opt-in. Il ne remplace pas automatiquement une conversation classique et n’active pas une autonomie illimitée. Les plafonds d’étapes, d’appels outils, de tokens, de coût estimé et de durée active sont déterminés côté serveur selon le plan et les classifications de données.

## Accès et permissions

- L’accès dépend de la session authentifiée, du contexte actif, du rôle, des permissions, du plan et des modules disponibles.
- Dans l’Assistant IA Entreprise, l’organisation active est relue depuis la session serveur ; un prompt ne peut pas sélectionner librement un autre tenant.
- L’agent ne reçoit que les outils déjà autorisés pour l’utilisateur et son contexte. Chaque exécution repasse ensuite par le **DTSC Tool Gateway** pour une nouvelle validation.
- Les documents RAG/CAG et les résultats d’outils sont traités comme des données non fiables, jamais comme des instructions capables de contourner les politiques DTSC.
- Pour les domaines Health, Finance, RH et Legal sensibles, l’agent reste limité aux usages de lecture et de préparation. Il ne peut pas prendre seul une décision clinique finale, effectuer un paiement ou une écriture comptable, décider d’une paie ou sanction RH, ni engager juridiquement l’entreprise.

Sur mobile, le panneau tient compte de la zone sûre de l’écran. Fermez-le pour revenir au chat principal sans perdre la conversation canonique.

## Statuts, validations et traçabilité

Les principaux états sont **Analyse en cours**, **Validation requise**, **Prêt à reprendre**, **Terminé**, **Annulé**, **Échec** et **Limite atteinte**. Le nombre d’étapes et d’appels outils consommés est comparé aux plafonds du run.

### Validation d’une action

Lorsqu’une mutation certifiée exige une validation :

1. le run passe à **Validation requise** ;
2. vérifiez l’action et son aperçu ;
3. choisissez **Valider** ou **Refuser** ;
4. après une validation réussie, choisissez **Reprendre après validation** pour continuer le même run.

Écrire « oui », « ok », « vas-y » ou une phrase équivalente dans le chat ne valide jamais une mutation. La confirmation utilise un contrôle structurel lié à l’action côté serveur. Un refus annule la proposition et ferme le run suspendu. Une action déjà confirmée et exécutée reste réelle et auditée même si le run est ensuite annulé.

### Annuler

Utilisez **Annuler** pour arrêter un run actif ou suspendu. L’annulation est enregistrée et propagée au runtime ainsi qu’au provider lorsque l’exécution est encore en cours. Elle ne supprime pas fictivement une mutation déjà exécutée.

La traçabilité conserve les informations opérationnelles utiles : statut, étapes, outil, provider/modèle lorsque pertinent, tokens, coût estimé, durée et codes de raison, sans recopier la conversation complète.

## Sécurité et confidentialité

- La chaîne de pensée privée, les prompts complets, les secrets et les arguments bruts des outils ne sont pas exposés par le panneau de statut.
- Les références d’organisation, de run, de conversation et de confirmation sont revérifiées côté serveur.
- Les limites envoyées par le navigateur peuvent seulement réduire les plafonds serveur, jamais les augmenter.
- Les mutations passent par le Tool Gateway et, lorsqu’exigé, par une confirmation humaine structurelle et idempotente.
- `SECRET` et les classifications sensibles restent soumis aux règles du Policy Router et ne deviennent pas exportables simplement parce qu’un outil ou un provider est disponible.
- Les connecteurs MCP ne sont utilisables que s’ils sont réellement configurés, certifiés et autorisés ; leur découverte distante ne crée aucun droit.

Avant toute décision importante, vérifiez les citations, les résultats métier et la source canonique concernée. Le Mode Agent aide à analyser, préparer et orchestrer ; il ne remplace pas les responsabilités professionnelles ou les workflows d’autorité.

## Dépannage

- **Limite atteinte** : réduisez la tâche ou démarrez un nouveau run plus ciblé ; ne cherchez pas à augmenter les plafonds depuis le navigateur.
- **Action non autorisée** : vérifiez le contexte d’organisation, votre rôle, vos permissions, votre plan et les modules accessibles.
- **Validation expirée** : demandez à l’agent de préparer de nouveau l’action afin de générer une nouvelle proposition valide.
- **Run prêt mais non repris** : utilisez **Reprendre après validation** ; la reprise continue le même run à partir du résultat canonique de l’outil.
- **Provider indisponible** : réessayez lorsque le service IA est disponible. N’utilisez pas une mutation métier directe non prévue pour contourner la politique.
- **Affichage non actualisé** : actualisez le statut du run ou rouvrez le panneau ; la source de vérité reste l’état serveur.

Si une anomalie persiste, conservez l’identifiant du run et le code de raison affiché puis contactez le support DTSC sans partager de données sensibles, de secrets ou de contenu privé inutile.