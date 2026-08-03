# Module professionnel Health — Dossiers médicaux

**Code canonique :** `MEDICAL_RECORDS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Périmètre

Le dossier médical est la vue longitudinale autorisée du patient : résumé, antécédents, allergies, traitements actifs, alertes, consultations, examens, documents, prescriptions et notes confidentielles.

## Modèle

Un patient possède un dossier principal unique par organisation. Les éléments longitudinaux sont des objets dédiés et historisés, pas des champs JSON génériques.

## Expérience

Le workspace permet de rechercher le patient, ouvrir le dossier, consulter les alertes actives, les consultations liées et les documents, puis ajouter les éléments autorisés. Les sections confidentielles sont séparées des informations administratives.

## Sécurité

Les rôles administratifs et Finance ne voient pas le contenu clinique. Les notes confidentielles exigent une permission renforcée. Les accès, téléchargements et changements sensibles sont audités. Toute tentative inter-tenant est refusée.

## Intégrations

Le dossier agrège les références Health sans recopier les données cliniques dans Finance. La révocation d’une relation DTSC retire les accès dérivés sans supprimer l’historique médical.

## Validation

QA automatisée : dossier unique, objets dédiés, alertes, confidentialité, routes privées et responsive.
E2E propriétaire : scénarios `I06-H-002` et `I06-H-005`.
