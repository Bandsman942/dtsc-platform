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