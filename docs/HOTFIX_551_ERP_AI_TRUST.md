# Hotfix #551 — confiance ERP et assistants IA

## Incident

La création d’un tiers pouvait réussir dans la source métier, puis être présentée comme échouée lorsqu’une notification, un audit ou un log postérieur rencontrait une erreur. Le formulaire n’affichait alors que « Création du tiers impossible », ce qui exposait l’utilisateur à un retry et à une fiche en double.

Dans une autre séquence, le chatbot général a affirmé analyser la trésorerie d’une entreprise puis a inventé des soldes, comptes bancaires, rapprochements et risques. Le runtime lui transmettait encore un contexte d’entreprise alors que cette surface ne disposait d’aucune preuve d’outil pour les faits annoncés.

## Correctif ERP

Les créations des cinq modules commerciaux livrés dans #550 — Tiers et clients, Catalogue, CRM, Devis et commandes, Contrats — séparent désormais :

1. la transaction métier canonique ;
2. les effets secondaires post-commit (notification, audit et log API).

Une panne de télémétrie ne transforme plus un enregistrement durable en faux échec utilisateur. Les erreurs métier utilisent un contrat partagé avec code stable et message FR/EN humain. Les conflits de doublon, entreprise inactive, tiers/référence introuvable, unité ou article inactif et approbateur invalide indiquent l’action corrective. Les erreurs Prisma, stacks, routes, identifiants et payloads ne sont jamais renvoyés.

## Frontières des assistants

| Surface | Responsabilité | Données d’entreprise | Actions |
|---|---|---|---|
| Chatbot général | Aide DTSC Platform, fonctionnalités générales et orientation | Aucune donnée ERP ; seulement documents personnels autorisés | Pas d’action ERP |
| IA Entreprise | Questions et analyses dans l’organisation active | Uniquement sources et outils réellement autorisés | Lecture et propositions selon permissions |
| Mode Agent | Parcours outillés multi-étapes | Reçus minimisés d’outils autorisés | Confirmation, idempotence et audit pour toute mutation sensible |

Le chatbot général exécute maintenant le runtime `PERSONAL`, même si l’utilisateur a une entreprise active. Il ne reçoit plus le profil, les activités, les documents ni le CAG de l’entreprise. Lorsqu’une question exige des données ERP, il oriente vers IA Entreprise ; une action multi-étapes est orientée vers le mode Agent.

IA Entreprise ne peut pas traiter une permission de module comme une preuve de lecture. Aucun chiffre, nom, solde, paiement, stock, statut, rapprochement ou conclusion propre à l’entreprise ne doit être présenté comme réel sans source autorisée ou reçu d’outil réussi. Une absence, un refus, un timeout ou un résultat partiel est annoncé comme tel ; aucune donnée d’exemple ne remplace silencieusement la donnée manquante.

Les résultats d’outils transmis au modèle sont bornés et minimisés : identifiants, clés tenant/utilisateur, métadonnées, payloads bruts, secrets et champs techniques inutiles sont retirés. Le modèle reçoit l’instruction de ne jamais recopier le reçu brut dans la réponse. Les conversations persistent la réponse métier, pas le dump backend.

## Niveau de raisonnement

Les préférences du chatbot général et d’IA Entreprise stockent un niveau `AUTO`, `LOW`, `MEDIUM` ou `HIGH`. Le sélecteur n’est actif que pour un modèle déclaré compatible dans le catalogue canonique. Le serveur valide l’enum et refuse un effort explicite sur un modèle incompatible. Pour OpenAI Responses, le niveau est envoyé via le paramètre provider prévu ; le contenu du raisonnement reste privé et n’est jamais rendu dans la conversation.

La migration `20260902003000_add_ai_reasoning_effort` est additive et ajoute uniquement les deux colonnes de préférence avec `AUTO` par défaut.

## Sécurité et rollback

- aucune permission n’est déduite du frontend ou du prompt ;
- l’autorisation d’un outil reste recalculée côté serveur avec session, organisation, module, entitlement et permission ;
- aucun changement destructif de données ;
- rollback applicatif par revert de la PR ; les deux colonnes additives peuvent rester présentes sans affecter l’ancienne version.

## Validation

La QA permanente couvre la séparation `PERSONAL` du chatbot général, le contrat anti-fabrication, la minimisation des reçus, la persistance et validation du niveau de raisonnement, les messages ERP partagés et l’indépendance des effets secondaires post-création. La recette propriétaire reste obligatoire avant merge pour le formulaire Tiers mobile et le scénario de trésorerie fourni.

## Dette de contribution

- Dette créée : aucune connue.
- Dette remboursée : faux échec post-création, erreurs génériques, contexte entreprise dans le chatbot général, frontières IA ambiguës, reçus backend insuffisamment minimisés et absence de niveau de raisonnement configurable.
- Dette maintenue : les outils de lecture disponibles dépendent encore du module et du secteur ; cette limite est désormais annoncée honnêtement au lieu d’être compensée par des données inventées.
- Dette reportée : aucune.
