# Budget de performance Console

Toutes les grandes listes utilisent une pagination serveur avec une taille par défaut de 20 ou 25 et un maximum de 100. Les références de sélecteurs sont bornées à 100 et ne remplacent pas une consultation paginée.

Chaque section charge uniquement son domaine. Les agrégations de la vue générale sont parallélisées ; aucune synchronisation n’est exécutée. Les caches futurs devront inclure capacité, contexte global, fraîcheur et invalidation.
