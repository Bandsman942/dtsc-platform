# Guide utilisateur — Postes de jeu / Gaming stations

## Français

### Avant de commencer

- L’entreprise doit utiliser le contexte `HOSPITALITY_EVENTS` + `GAMING_LOUNGE` prévu par le programme Gaming.
- `GAMING_STATIONS`, `ASSETS_MAINTENANCE` et `SITES_WAREHOUSES` doivent être autorisés pour l’entreprise.
- Chaque console utilisée comme poste doit déjà exister dans **Actifs & maintenance**.
- Le chiffre de cinq PlayStations correspond uniquement au parc initial d’exemple. Vous pouvez ajouter une sixième console puis continuer à agrandir le parc.

### Procédure pas à pas

1. Ouvrez **Postes de jeu**.
2. Touchez **Ajouter un poste**.
3. Recherchez l’actif console dans la liste paginée. Si l’actif n’apparaît pas, vérifiez qu’il est actif, non sorti du parc et pas déjà lié à un poste Gaming.
4. Choisissez l’actif puis renseignez le numéro du poste, le nom affiché, le type de console, le nombre maximal de joueurs et l’ordre d’affichage.
5. Enregistrez. Le nouveau poste apparaît dans le board selon sa position.
6. Pour ajouter d’autres consoles, répétez exactement la même procédure ; aucune configuration spéciale n’est requise après les cinq premiers postes.
7. Ouvrez un poste pour consulter l’actif, le site, la catégorie, le numéro de série et les éventuels blocages de maintenance/incidents.
8. Utilisez **Mettre hors service** pour un blocage Gaming manuel.
9. Utilisez **Signaler un incident** pour créer l’incident directement dans **Actifs & maintenance**.
10. Utilisez **Rendre disponible** uniquement lorsque l’actif n’a plus d’incident majeur ni de maintenance en cours.

### Statuts et workflow

- **Disponible** : le poste peut être utilisé.
- **En jeu** : réservé au moteur de sessions du lot #641.
- **Réservé** : réservé au moteur de réservations du lot #642.
- **Maintenance** : dérivé d’une maintenance Asset en cours.
- **Hors service** : blocage Gaming manuel, actif sorti du parc ou incident majeur ouvert.

Un état Asset bloquant a priorité sur le statut manuel Gaming. Le navigateur ne peut pas masquer une panne réelle en affichant le poste comme disponible.

### Contrôles et confidentialité

- Les actifs d’une autre entreprise ne peuvent pas être utilisés.
- Les droits du module Gaming et ceux d’Actifs & maintenance sont vérifiés côté serveur.
- Les changements utilisent une révision optimiste pour éviter d’écraser une modification concurrente.
- Archiver le poste ne supprime ni l’actif ni son historique de maintenance.
- Le parc est paginé : augmenter le nombre de consoles ne déclenche pas un chargement illimité côté navigateur.

### Dépannage

- **L’actif n’apparaît pas** : vérifiez qu’il n’est ni archivé, ni `DISPOSED`, ni déjà lié à un profil Gaming.
- **Le poste refuse de redevenir disponible** : résolvez l’incident majeur ou terminez/annulez la maintenance dans Actifs & maintenance.
- **Le numéro du poste est refusé** : un autre poste utilise déjà ce numéro dans la même entreprise.
- **L’archivage est refusé** : une session ou une réservation active référence encore ce poste.
- **La sixième console n’apparaît pas** : utilisez la recherche/pagination des actifs ; il n’existe pas de plafond à cinq postes.

## English

### Before you start

- The organization must use the `HOSPITALITY_EVENTS` + `GAMING_LOUNGE` context defined by the Gaming program.
- `GAMING_STATIONS`, `ASSETS_MAINTENANCE`, and `SITES_WAREHOUSES` must be allowed for the organization.
- Every console used as a station must already exist in **Assets & maintenance**.
- Five PlayStations is only the initial example fleet. You can add a sixth console and continue growing the fleet.

### Step-by-step procedure

1. Open **Gaming stations**.
2. Select **Add station**.
3. Search for the console asset in the paginated list. If it is missing, verify that it is active, not disposed, and not already linked to a Gaming station.
4. Select the asset, then enter the station number, display name, console type, maximum players, and display order.
5. Save. The new station appears in the board according to its order.
6. To add more consoles, repeat the exact same procedure; no special setup is required after the first five stations.
7. Open a station to inspect its asset, site, category, serial number, and any maintenance/incident blockers.
8. Use **Take out of service** for a manual Gaming block.
9. Use **Report incident** to create the incident directly in **Assets & maintenance**.
10. Use **Make available** only after the asset has no major open incident or maintenance in progress.

### Statuses and workflow

- **Available**: the station can be used.
- **In use**: reserved for the session engine delivered by #641.
- **Reserved**: reserved for the booking engine delivered by #642.
- **Maintenance**: derived from an in-progress Asset maintenance record.
- **Out of service**: manual Gaming block, disposed/archived asset, or major open incident.

A blocking Asset state takes precedence over the manual Gaming status. The browser cannot hide a real equipment problem by presenting the station as available.

### Controls and confidentiality

- Assets from another organization cannot be used.
- Gaming module permissions and Assets & maintenance permissions are enforced server-side.
- Mutations use optimistic revision checks to avoid overwriting concurrent changes.
- Archiving a station never deletes its asset or maintenance history.
- The fleet is paginated, so adding more consoles does not cause an unbounded browser-side load.

### Troubleshooting

- **Asset not listed**: verify that it is not archived, `DISPOSED`, or already linked to a Gaming profile.
- **Station cannot become available**: resolve the major incident or complete/cancel maintenance in Assets & maintenance.
- **Station number rejected**: another station already uses that number in the same organization.
- **Archive rejected**: a live session or active booking still references the station.
- **Sixth console not visible immediately**: use asset search/pagination; there is no five-station ceiling.
