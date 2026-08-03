# Mes Collaborateurs — règles pérennes

- L’expérience principale reste conversationnelle et mobile-first : liste/discussion plein écran sur mobile, split view sur desktop.
- Sur mobile/PWA, le workspace conversationnel verrouille le scroll global de page : seules la liste des groupes et le fil de messages défilent en interne, en suivant `VisualViewport` et le chrome mobile DTSC existant.
- Il ne doit exister qu’un seul moteur de geste pour l’apparition/disparition des navigations haute/basse. Dans une conversation immersive, distinguer explicitement un tap d’un drag ; un même geste tactile ne doit jamais pouvoir être interprété successivement par un `pointerdown` puis par un second moteur basé sur le scroll.
- Le hook immersif synchronise uniquement la géométrie `VisualViewport`. Il ne doit pas décider de l’état visible/masqué du chrome à partir du scroll du fil.
- Le scroll interne ne doit jamais recalculer la géométrie du workspace à chaque événement : limiter le travail à `requestAnimationFrame`, ne changer l’état du chrome que lorsqu’il change réellement et laisser les navigations mobiles s’animer en overlay sans reflow du fil.
- Éviter `getComputedStyle`, mesures répétées du header/footer ou écritures de styles synchrones dans la boucle chaude d’un scroll conversationnel.
- Réutiliser les composants conversationnels communs (`ConversationHeader`, `ConversationListItem`, `ConversationAvatar`, `ActionMenu`) plutôt que recréer des cartes décoratives.
- Les filtres de discussions doivent rester compacts, horizontaux et tactiles ; ne pas introduire de tableau ou de grands conteneurs imbriqués.
- Les couleurs des participants doivent rester stables et déterministes à partir d’un identifiant utilisateur lorsque possible, jamais aléatoires à chaque rendu, et lisibles en thème clair/sombre.
- Le composer conversationnel principal reste multiligne : `Entrée` crée une nouvelle ligne et l’envoi est une action explicite via bouton ou raccourci documenté.
- Les actions contextuelles de groupe et de message passent par le menu `...` lorsqu’elles ne sont pas primaires.
- Le journal des connexions/déconnexions d’un groupe est visible uniquement pour un OWNER/ADMIN autorisé et déjà membre actif du groupe. Les heartbeats mettent à jour une session existante ; ils ne doivent pas créer une ligne d’historique à chaque ping.
- Les filtres du journal de présence doivent rester bornés côté serveur, respecter les périodes d’appartenance au groupe et ne jamais révéler les sessions d’un utilisateur avant son adhésion ou après son départ.
- Les accusés de lecture existants `CollaborationGroupMessageRead.readAt` sont la source de vérité : l’UI `Infos du message` doit conserver l’heure exacte de lecture et l’état de présence du membre, sans créer une seconde table de lecture.
- Les appels audio/vidéo LiveKit existants restent une capacité du module et ne doivent pas être remplacés par les messages vocaux.
- Un message vocal est un `CollaborationGroupMessage` traçable accompagné de métadonnées privées ; il ne constitue pas un appel.
- Les capacités vocales visibles dans le composer proviennent du backend ; l’UI ne doit jamais devenir la source de vérité des limites de durée/taille ou de l’activation.
- Une réunion audio/vidéo DTSC liée au COO réutilise obligatoirement `CooMeeting`, son `CollaborationGroup` de réunion, `CollaborationGroupCall` et `CooMeetingMinutes`. Ne jamais dupliquer ces objets dans un moteur parallèle.
- Le message `MEETING_LINK` est dérivé de la réunion COO réelle, devient rejoignable à `availableFrom` et doit réutiliser l’appel actif s’il existe déjà afin d’éviter plusieurs rooms concurrentes pour la même réunion.
- À la fin d’un appel lié à une réunion, le fil peut créer un `MEETING_MINUTES_PROMPT`. Le compte-rendu est persisté dans `CooMeetingMinutes` et un résumé texte est publié dans le groupe ; ces actions doivent rester idempotentes et permissionnées.
- Les photos de groupe, statuts et messages vocaux sont des médias privés. Ne jamais persister d’URL publique ; utiliser des chemins serveur et des URL signées temporaires.
- Seuls un OWNER ou ADMIN du groupe, déjà membre actif dans le contexte autorisé, peut modifier la photo de groupe.
- Un statut de groupe est éphémère et expire par défaut après 24 heures. Une suppression doit rester possible par son auteur ou un gestionnaire du groupe.
- Les préférences de favori, épinglage, archivage, mute et notifications sont propres à l’utilisateur et ne modifient pas les préférences des autres membres.
- Préserver les réponses, mentions, accusés de lecture, invitations, présence, partage de conversations et historique de messages existants.
- Toute nouvelle UI visible doit rester disponible en français et en anglais.
- Préserver les règles iOS/PWA existantes : contrôles natifs pour les fichiers, zones tactiles suffisantes, safe areas et composer accessible avec clavier ouvert.

## Itération standard 03

- La liste de collaborateurs n’est jamais alimentée par un annuaire global ouvert.
- Le compositeur conserve une clé client stable pendant un retry et n’affiche jamais un message comme livré ou lu sans preuve serveur.
- Une notification d’appel ouvre le groupe et présente accepter/refuser sans auto-join.
- À 320 px, le compositeur, les pièces jointes, le retour à la liste et les contrôles d’appel restent visibles.
