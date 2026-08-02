# Valorisation comptable professionnelle du stock

## Frontière métier

Le module Stock reste l’autorité des quantités physiques et des mouvements. `FINANCE_INVENTORY` calcule les coûts, valeurs, couches comptables et écritures ; une consultation financière ne modifie jamais le stock physique.

## Méthode supportée

La configuration actuelle supporte le coût moyen pondéré. Les méthodes FIFO, coût standard ou coût spécifique ne sont pas proposées comme utilisables tant que leurs moteurs complets ne sont pas livrés.

## Réceptions et sorties

- une réception crée une couche de coût avec quantité, coût unitaire, valeur et devise ;
- une sortie consomme la valeur moyenne disponible ;
- un stock comptable négatif est refusé ;
- chaque mouvement utilise une clé d’idempotence ;
- l’écriture associée est créée par le moteur comptable commun.

## Consultation et publication

Le workspace affiche quantité, coût moyen et valeur par article, entrepôt et devise. Une version de valorisation peut être publiée comme état financier immuable pour une période donnée.

## Contrôles

- mouvement et article du même tenant ;
- devise présente ;
- couche de coût disponible ;
- compte de stock et compte de variation configurés ;
- aucune double valorisation du même événement ;
- aucune réécriture silencieuse d’une période fermée.
