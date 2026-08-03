# Matrice de permissions de collaboration

| Action | Participant | Admin groupe | Propriétaire | Admin organisation/DTSC autorisé |
|---|---:|---:|---:|---:|
| Lire un groupe actif autorisé | Oui | Oui | Oui | Seulement s’il est participant |
| Envoyer un message | Oui | Oui | Oui | Seulement s’il est participant |
| Modifier son message | Oui, selon politique | Oui pour son contenu | Oui pour son contenu | Non par rôle global seul |
| Supprimer son message | Oui, logique | Oui | Oui | Via modération autorisée |
| Inviter/retirer un membre | Non | Oui | Oui | Non par rôle global seul |
| Promouvoir administrateur | Non | Oui | Oui | Non par rôle global seul |
| Transférer la propriété | Non | Non | Oui | Non |
| Fermer le groupe | Non | Selon capacité | Oui | Non |
| Épingler un message | Non | Oui | Oui | Non |
| Modérer un message signalé | Non | Oui dans son groupe | Oui | Équipe DTSC uniquement dans son périmètre |
| Lire une annonce | Selon audience | Selon audience | Selon audience | Selon audience/contexte |
| Modifier une annonce | Auteur selon politique | — | — | Modérateur du contexte |
| Modérer un commentaire | Non | — | Auteur de l’annonce selon politique | Modérateur du contexte |

La connaissance d’un identifiant ne constitue jamais une autorisation. Toute route reconstruit le contexte, vérifie le membership actif, l’état de l’objet, les blocages et les capacités applicables.
