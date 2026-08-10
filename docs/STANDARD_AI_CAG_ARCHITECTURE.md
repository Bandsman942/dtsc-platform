# DTSC AI — CAG Architecture

## Principe

Le CAG enrichit un assistant avec du contexte métier contrôlé par DTSC. Il ne remplace ni le RAG documentaire ni les outils backend.

Un builder CAG doit :

- lire uniquement le tenant actif ;
- utiliser des données déjà autorisées ;
- minimiser les données ;
- ne jamais injecter de secret ;
- retourner un code et une version ;
- respecter une politique de cache qui ne peut pas élargir les droits.

## Registry

`lib/ai/cag-registry.ts` maintient le registre de builders et un cache mémoire court.

La clé contient au minimum :

```text
organizationId
userId
assistant profile code/version
CAG builder code/version
contextVersion
```

Le `contextVersion` dépend notamment du rôle, poste, plan, modules lisibles et versions de configuration pertinentes. Un changement de rôle ou de configuration produit donc une autre clé.

Le cache est local au runtime et possède un TTL court de deux minutes. Il n'est jamais partagé entre tenants ni entre utilisateurs.

## Builders actifs

### PHARMACY

Le builder utilise des paramètres Pharmacy minimisés. Sa version inclut `PharmacySetting.settingsVersion`, ce qui invalide logiquement le CAG lorsqu'une configuration pharmacie change.

Règles majeures : FEFO, pas de mutation simulée, minimisation financière/qualité.

### HEALTH_CARE

Le builder de base est volontairement non clinique.

Il ne charge automatiquement :

- aucun patient ;
- aucun diagnostic ;
- aucune consultation ;
- aucun dossier médical.

Le Context Engine vérifie séparément si l'utilisateur possède un droit de lecture de `MEDICAL_RECORDS`. Même lorsque ce droit existe, les données cliniques ne sont pas injectées automatiquement dans le CAG. Une future récupération clinique devra posséder sa propre policy et son propre contrôle d'objet.

### COMMERCE_RETAIL / SHOP

Le builder fournit les règles opérationnelles générales et les modules réellement lisibles. Il ne fabrique aucun niveau de stock, prix, vente ou encaissement.

## Relation avec RAG

Le CAG fournit des règles et du contexte structuré. Le RAG fournit des extraits documentaires déjà accessibles. Les sources RAG restent des données non fiables et ne peuvent pas modifier la policy système.

## Relation avec les tools

Un CAG peut décrire ce qui est possible, mais il n'exécute rien. Les mutations resteront subordonnées au futur Tool Gateway : permission, confirmation, idempotence, transaction et audit.

## Données sensibles

- organisation active : `CONFIDENTIAL` par défaut ;
- Health : aucune donnée clinique automatique ;
- `SECRET` : reste interdit aux providers externes par le Policy Engine ;
- un changement de rôle ne doit jamais réutiliser un cache créé pour un ancien niveau d'accès.
