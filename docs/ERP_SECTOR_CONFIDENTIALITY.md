# Confidentialité des extensions Health et Pharmacy

## 1. Principe de minimisation

Le Core financier reçoit uniquement les données nécessaires à la facturation, aux créances, paiements, allocations, écritures et rapports financiers.

Il ne reçoit jamais sans nécessité explicite : diagnostic, symptômes, observations, résultats biologiques, prescription détaillée, note clinique, document médical ou historique de soins.

## 2. Frontières Health

Health reste l’autorité pour patients, rendez-vous, consultations, dossiers médicaux, laboratoire, prescriptions, consentements cliniques et documents médicaux.

- Finance accède aux références financières, tiers, montants, échéances et statuts nécessaires.
- Un rôle administratif ou global DTSC ne contourne jamais une permission clinique.
- Un patient lié à un compte DTSC n’obtient que les accès explicitement résolus et partagés.
- Un résultat validé ou une consultation clôturée ne sont pas modifiés silencieusement.
- Les accès sensibles et téléchargements sont audités.

## 3. Frontières Pharmacy

Pharmacy reste l’autorité pour lots, péremption, FEFO, quarantaine, rappels, qualité, pharmacovigilance et documents réglementaires.

Les données patient sont minimisées dans les prescriptions et incidents. Les utilisateurs Finance et les rôles non autorisés ne voient pas la pharmacovigilance ni le contenu clinique d’une ordonnance.

## 4. Isolation tenant

Toute lecture et écriture vérifie :

```text
session
→ organisation active
→ membre actif
→ secteur
→ module actif
→ entitlement
→ permission
→ visibilité de l’objet
```

Toute référence fournie par le client est revalidée dans le même `organizationId`. Un identifiant d’un autre tenant est refusé sans révéler l’existence de la donnée.

## 5. Documents

- documents médicaux : stockage privé Health ;
- documents réglementaires : stockage privé Pharmacy ;
- documents généraux : système documentaire entreprise ;
- validation MIME/taille ;
- téléchargement par route serveur ;
- version, archivage et audit ;
- aucune URL libre comme substitut unique à l’upload.

## 6. Notifications et logs

Les notifications verrouillées restent génériques. Les logs ne contiennent ni diagnostic, résultat médical, prescription détaillée, document, token, secret, salaire ou numéro bancaire complet.

## 7. Identité relationnelle

Une fiche métier peut exister sans compte DTSC. Une liaison exige un consentement explicite. Sa révocation retire les accès dérivés sans supprimer la fiche ni réactiver un accès antérieur.

## 8. Tests obligatoires

- accès inter-tenant ;
- accès Finance à une consultation ;
- téléchargement médical ;
- accès après révocation ;
- lien profond non autorisé ;
- notification sensible ;
- lot d’un autre tenant ;
- vente de lot expiré ou bloqué ;
- contournement validation pharmacien ;
- document réglementaire non autorisé ;
- rôle global utilisé comme bypass.

Les scénarios authentifiés finaux restent exécutés manuellement par le propriétaire.
