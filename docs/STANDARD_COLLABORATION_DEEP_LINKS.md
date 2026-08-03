# Liens profonds de collaboration

Routes canoniques :

- `/collaborators?groupId={groupId}&message={messageId}` : conversation et message exact ;
- `/collaborators?groupId={groupId}&joinCall={callId}` : groupe et appel ciblé sans acceptation automatique ;
- `/announcements/{announcementId}` : annonce exacte ;
- `/announcements/{announcementId}?commentId={commentId}` : annonce, bloc de commentaires et commentaire exact.

L’ouverture conserve le contexte multidomaine et effectue un contrôle d’accès serveur. Le message ou commentaire ciblé est chargé même s’il se trouve hors de la première page. L’utilisateur garde une action de retour sûre.
