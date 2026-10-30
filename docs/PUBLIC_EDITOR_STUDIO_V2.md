# PUBLIC-UX-06 — Studio éditorial grand format (#972)

## Première passe
- Création et édition dans la présentation partagée plein écran "editor" (Dialog responsive), suppression du formulaire étroit intégré à la liste.
- Outils riches et prévisualisation conservés, support vidéo HTML5 sûr et médias existants.
- Hauteur de rédaction configurable dans RichTextEditor ; les autres usages gardent leur hauteur par défaut.
- API, validations, permissions, historique et données canoniques inchangés.

## Restant à implémenter dans cette Issue
Migration graduelle vers un éditeur moderne, sauvegarde automatique sûre, versions restaurables, SEO, bibliothèque de médias, planification et nouvelles E2E. Rien de cela n'est prétendu livré par cette passe.

## QA et rollback
Vérifier création, édition, confirmation, refus d'autorisation, médias, iOS/clavier, 320/360/375/390/414/768/1024, clair/sombre, FR/EN et accessibilité. Rebaser sur #967 avant fusion pour les catégories et la sanitation. Production depuis main uniquement, rollback par revert sans migration.
## Compléments implémentés
Les métadonnées SEO individuelles sont modifiables depuis le Studio et conservées dans le champ canonique PublicPublication.seoJson. La consultation de l'historique des versions et la restauration contrôlée (avec création d'une nouvelle version, audit et confirmation asynchrone) sont opérationnelles côté code. Les droits de lecture des versions sont limités au gestionnaire ou à l'auteur de son brouillon; la restauration exige CONTENT_MANAGE. Les modifications non enregistrées déclenchent une confirmation asynchrone.

Restent hors livraison : remplacement du moteur document.execCommand, autosauvegarde serveur idempotente et programmation durable de la publication; aucune de ces fonctions n'est annoncée disponible en production.
