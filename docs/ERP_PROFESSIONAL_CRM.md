# CRM professionnel — Itération 2

Le module `CRM_PIPELINE` offre une vue liste et une vue pipeline accessible. Chaque prospect ou opportunité possède une source, un responsable, une valeur, une probabilité, une échéance et une prochaine action.

La conversion d’un prospect est transactionnelle. L’utilisateur choisit explicitement une fiche existante ou confirme la création d’une nouvelle fiche. Les correspondances possibles sont affichées avant conversion ; aucune fusion ou création silencieuse n’est réalisée.

Les changements d’étape sont validés côté serveur avec contrôle de révision. Une alternative par menu d’action existe toujours au glisser-déposer. Les notifications ciblent l’objet précis et la section « prochaine action ».

La liaison DTSC d’un prospect personne reste facultative et suit le contrat de consentement. Une relation non active ne donne aucun avantage.
