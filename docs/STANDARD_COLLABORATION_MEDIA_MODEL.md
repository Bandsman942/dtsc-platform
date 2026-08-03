# Médias et pièces jointes collaboratives

Les pièces jointes de messages passent par une route serveur privée. Le serveur contrôle le membership, la taille, le MIME normalisé, le type autorisé et calcule un checksum SHA-256 avant de persister les métadonnées.

Les fichiers sont stockés dans un chemin privé lié au groupe et téléchargés par URL signée temporaire après un nouveau contrôle d’accès. Les suppressions sont logiques et auditées.

Les images utilisent la visionneuse commune plein écran, sans étirement, avec ratio conservé, zoom, navigation clavier et fermeture par `Escape`. Les listes utilisent les versions adaptées ; l’original n’est chargé que dans la visionneuse.

Limitation : aucun fournisseur antivirus n’est configuré dans le repository. La validation MIME/taille/checksum est active ; l’ajout d’un pipeline antivirus devra rester serveur, asynchrone et bloquant avant exposition.
