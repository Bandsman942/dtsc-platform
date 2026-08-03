# Modèle Entreprise du compte standard

## Concepts

1. **Profil professionnel déclaré** : `CompanyProfile`, édité par l’utilisateur pour contextualiser son compte.
2. **Organisation cliente** : `Organization`, espace multi-tenant administré selon ses règles.
3. **Membership** : `OrganizationMember`, autorise un utilisateur à rejoindre et sélectionner une organisation.
4. **Relation externe** : identité relationnelle canonique avec consentement, indépendante du membership.
5. **Entreprise employeur ou partenaire** : qualité métier portée par la relation, le poste ou les référentiels concernés.
6. **Contexte actif** : état de session qui détermine les données et modules consultés.

## Invariants

- un profil déclaré ne crée aucune organisation ;
- une relation active ne crée aucun membership ;
- un membership ne donne pas automatiquement une permission sensible ;
- le compte personnel ne modifie jamais les données administratives d’une organisation sans capacité serveur ;
- aucune fusion automatique n’est réalisée par similarité de nom ou d’e-mail.

## Édition

Le profil professionnel et ses activités sont éditables par leur propriétaire. Les organisations, rôles, consentements, relations validées et données ERP restent administrés par leurs moteurs canoniques.
