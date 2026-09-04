# Abonnement — cartes lisibles et offres administrables

## Corrigé

- Les cartes d’offres dans **Administration DTSC** ne sont plus écrasées par le badge de statut et le menu d’actions sur mobile. Le nom, la description et les métadonnées gardent une largeur lisible.
- Les cartes **Abonnement et facturation** utilisent un contraste renforcé pour les descriptions, prix secondaires et quotas en mode clair comme sombre.

## Amélioré

- Le **nom commercial** et la **description commerciale** enregistrés depuis Administration DTSC deviennent la copie publiée de l’offre. Ils se répercutent sur le catalogue backend, les cartes d’abonnement, la page publique Tarifs, la Console DTSC et le contexte catalogue utilisé par les assistants IA.
- Le formulaire d’administration indique explicitement que le nom, la description, le prix, les quotas, l’ordre d’affichage et la disponibilité sont publiés via le resolver commercial canonique.
- Les IDs, slugs, audiences canoniques et niveaux techniques restent protégés afin que la personnalisation commerciale ne modifie pas les règles d’entitlement.
