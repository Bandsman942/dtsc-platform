# Matrice de permissions des outils IA

| Mode | Lecture | Effet métier | Confirmation | Idempotence | Audit |
|---|---:|---:|---:|---:|---:|
| READ | Oui | Aucun | Non | Oui | Selon sensibilité |
| PREPARE | Oui | Brouillon seulement | Non pour préparer | Oui | Oui |
| MUTATE | Selon besoin | Écriture contrôlée | Oui lorsque applicable | Obligatoire | Renforcé |
| SENSITIVE_MUTATE | Selon besoin | Écriture sensible | Toujours | Obligatoire | Complet |

Les permissions sont cumulatives : session + contexte + membership + module + permission + plan + objet + classification. Un rôle global DTSC ne contourne jamais une organisation cliente. L’itération 05 conserve les outils entreprise actifs en lecture ; les mutations restent fermées tant qu’un service canonique, une confirmation et une QA dédiée ne sont pas disponibles.
