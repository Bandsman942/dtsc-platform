# ERP professionnel — Actifs et maintenance

## Périmètre

Module canonique : `ASSETS_MAINTENANCE`.

Le module porte le registre opérationnel des actifs, leurs affectations, retours, maintenances et incidents.

## Fiche actif

- Référence, catégorie, nom, description et numéro de série.
- Fournisseur et achat d’origine éventuels.
- Date d’acquisition, valeur indicative, devise et garantie.
- Site, emplacement et responsable.
- État, statut, affectations, incidents, maintenances et historique.

Les références catégorie, fournisseur, achat, site, emplacement et responsable sont revalidées côté serveur dans la même entreprise. Si un achat et un fournisseur sont indiqués ensemble, leur cohérence est contrôlée.

## Cycle d’affectation

```text
Disponible → Affecté → Retourné → Disponible
```

Une seule affectation active est permise. Une affectation possède une cible métier valide et conserve les dates, l’état initial, l’état au retour et les notes. Le retour est révisionné afin d’empêcher une seconde restitution concurrente du même enregistrement.

## Statut opérationnel

Le statut global est recalculé à partir des faits actifs selon cette priorité :

```text
incident grave ouvert
> maintenance en cours
> affectation active
> disponible
```

Une maintenance ou un incident ne supprime donc pas l’information d’affectation. La fin d’une maintenance ou la résolution d’un incident ne remet pas l’actif disponible lorsqu’une autre condition active l’empêche.

## Maintenance

- Préventive ou corrective.
- Priorité, responsable et fournisseur éventuel.
- Date prévue, échéance, coût indicatif et notes.
- Cycle contrôlé : planifiée → en cours → terminée, avec annulation lorsque permise.
- Transitions révisionnées et auditées côté serveur.

## Incidents

- Type, titre, description et gravité.
- Date, déclarant et responsable.
- Statut ouvert ou résolu.
- Résolution conservée dans l’historique.
- Un incident grave ouvert peut placer l’actif hors service sans effacer ses autres faits opérationnels.

## Référentiels liés

Les achats et fournisseurs restent gérés dans leur module source. Les sites et emplacements restent gérés dans leurs référentiels propres. Le registre d’actifs ne crée pas automatiquement un achat ou un mouvement de stock lorsqu’une référence est ajoutée.

Le registre opérationnel ne remplace pas le module financier chargé des immobilisations.

## UX et sécurité

- Registre paginé, recherchable et filtrable.
- Formulaires en `presentation="editor"`.
- Revues explicites pour maintenance et résolution d’incident.
- États `saving/disabled`, feedback local et toast global.
- Aucun `window.prompt`, `window.alert` ou `window.confirm` dans le parcours métier.
- Isolation stricte par `organizationId` et revalidation serveur des références liées.
- Contrôle de révision, same-origin, validation des payloads, rate limit et audit sur les mutations sensibles.

## Rollback

Un rollback applicatif ne supprime jamais les affectations, retours, maintenances ou incidents déjà enregistrés. Le hotfix n’introduit pas de migration destructive.

## Maturité

`PROFESSIONAL_READY` sous réserve des Quality Gates du head livré. `OWNER_E2E` reste obligatoire avant merge pour `ASSETS_MAINTENANCE`.
