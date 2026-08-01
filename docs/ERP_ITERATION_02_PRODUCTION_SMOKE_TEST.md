# Recette Production — Itération ERP 02

## Objet

Cette procédure valide en Production les cinq workspaces professionnels, les liens d’identité consentis, les e-mails Zoho, les liens profonds et l’expiration périodique. Elle doit être exécutée après le déploiement unique issu de `main`.

## Préconditions

- le SHA Production correspond exactement au SHA fusionné dans `main` ;
- `prisma migrate deploy` a appliqué `20260801170000_professionalize_erp_iteration_02` ;
- deux comptes de recette existent : un administrateur d’entreprise et un utilisateur global DTSC ;
- l’entreprise de recette possède les modules concernés et un abonnement compatible ;
- les secrets Zoho et `CRON_SECRET` ou `WORKFLOW_WORKER_SECRET` sont configurés ;
- aucune donnée personnelle réelle n’est utilisée.

## Parcours Tiers et identité

1. Créer une personne manuellement et vérifier le détail 360°.
2. Créer une organisation puis vérifier ses rôles, contacts et adresses.
3. Inviter le compte de recette utilisateur depuis une fiche personne.
4. Vérifier la réception de l’e-mail Zoho et de la notification privée.
5. Ouvrir le lien après authentification et accepter la finalité affichée.
6. Vérifier `ACTIVE` dans la fiche métier et l’accès résolu côté serveur.
7. Révoquer depuis l’espace utilisateur.
8. Vérifier le retrait immédiat des capacités, la conservation de la fiche et l’historique audité.
9. Refaire un parcours utilisateur → entreprise, sélectionner une fiche par recherche puis approuver.
10. Refuser une seconde demande et vérifier qu’aucune relation active ni aucun avantage n’est créé.

## Catalogue

- créer une catégorie et une unité ;
- créer un produit et un service ;
- ajouter un prix daté avec devise et fiscalité ;
- modifier puis archiver logiquement l’élément ;
- vérifier l’historique tarifaire et l’affichage mobile.

## Sites, entrepôts et emplacements

- créer un site, un entrepôt lié et deux emplacements hiérarchiques ;
- vérifier le filtrage tenant des sélecteurs ;
- modifier chaque niveau ;
- vérifier la liste imbriquée mobile sans débordement horizontal.

## CRM

- créer un prospect, un lead et une opportunité ;
- affecter un responsable et une prochaine action ;
- changer d’étape via le menu accessible ;
- vérifier la notification profonde sur l’objet précis ;
- prévisualiser une conversion, réutiliser ou créer explicitement la fiche, puis vérifier l’idempotence.

## Contrats

- créer un contrat lié à un tiers ;
- modifier le brouillon ;
- soumettre avec approbateur ;
- approuver, activer, suspendre, renouveler, résilier puis archiver selon les transitions autorisées ;
- vérifier les notifications profondes, la révision et l’absence de mutation directe du statut côté client.

## Expiration des invitations

1. Préparer une invitation de recette dont `expiresAt` est dépassé.
2. Appeler manuellement le worker avec le secret autorisé.
3. Vérifier que le traitement est borné, idempotent et sans e-mail en clair dans les logs.
4. Vérifier le statut `EXPIRED`, la notification et le rejet du token.
5. Vérifier l’exécution horaire Vercel à la minute 17.

## E-mails Zoho et liens profonds

Vérifier invitation, création de compte, demande utilisateur, approbation, refus, expiration et révocation. Chaque URL doit reprendre le parcours après connexion, n’exposer aucune donnée sensible, refuser un token expiré ou déjà utilisé et fonctionner sur mobile.

## Critères de clôture

La recette est concluante uniquement si les tests ci-dessus passent sans fuite inter-tenant, sans code technique visible en français, sans avantage accordé à une relation non active et sans second déploiement manuel.
