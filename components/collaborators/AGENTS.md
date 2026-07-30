# Mes Collaborateurs — règles pérennes

- L’expérience principale reste conversationnelle et mobile-first : liste/discussion plein écran sur mobile, split view sur desktop.
- Sur mobile/PWA, le workspace conversationnel verrouille le scroll global de page : seules la liste des groupes et le fil de messages défilent en interne, en suivant `VisualViewport` et le chrome mobile DTSC existant.
- Ne pas créer un second moteur concurrent pour le tap d’apparition/disparition des navigations haute/basse ; le shell immersif synchronise uniquement l’espace disponible et le scroll interne.
- Réutiliser les composants conversationnels communs (`ConversationHeader`, `ConversationListItem`, `ConversationAvatar`, `ActionMenu`) plutôt que recréer des cartes décoratives.
- Les filtres de discussions doivent rester compacts, horizontaux et tactiles ; ne pas introduire de tableau ou de grands conteneurs imbriqués.
- Les couleurs des participants doivent rester stables et déterministes à partir d’un identifiant utilisateur lorsque possible, jamais aléatoires à chaque rendu, et lisibles en thème clair/sombre.
- Le composer conversationnel principal reste multiligne : `Entrée` crée une nouvelle ligne et l’envoi est une action explicite via bouton ou raccourci documenté.
- Les actions contextuelles de groupe et de message passent par le menu `...` lorsqu’elles ne sont pas primaires.
- Les appels audio/vidéo LiveKit existants restent une capacité du module et ne doivent pas être remplacés par les messages vocaux.
- Un message vocal est un `CollaborationGroupMessage` traçable accompagné de métadonnées privées ; il ne constitue pas un appel.
- Les capacités vocales visibles dans le composer proviennent du backend ; l’UI ne doit jamais devenir la source de vérité des limites de durée/taille ou de l’activation.
- Les photos de groupe, statuts et messages vocaux sont des médias privés. Ne jamais persister d’URL publique ; utiliser des chemins serveur et des URL signées temporaires.
- Seuls un OWNER ou ADMIN du groupe, déjà membre actif dans le contexte autorisé, peut modifier la photo de groupe.
- Un statut de groupe est éphémère et expire par défaut après 24 heures. Une suppression doit rester possible par son auteur ou un gestionnaire du groupe.
- Les préférences de favori, épinglage, archivage, mute et notifications sont propres à l’utilisateur et ne modifient pas les préférences des autres membres.
- Préserver les réponses, mentions, accusés de lecture, invitations, présence, partage de conversations et historique de messages existants.
- Toute nouvelle UI visible doit rester disponible en français et en anglais.
- Préserver les règles iOS/PWA existantes : contrôles natifs pour les fichiers, zones tactiles suffisantes, safe areas et composer accessible avec clavier ouvert.
