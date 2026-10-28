# OWNER E2E #916 — Certification du référentiel des 23 relations

**Pré-requis :** PR #922, CI GitHub Quality/Migration et Shop2 success sur le SHA final. Pas de Preview Vercel et aucune mutation dans une vraie entreprise cliente sans accord explicite.

## Parcours propriétaire

1. Ouvrir **Relations et consentements** en tenant client test et vérifier les 23 types proposés, dont SUPPLIER, SUPPLIER_REPRESENTATIVE, PROSPECT, CUSTOMER_CONTACT, CONTRACTOR, OTHER et VIP.
2. Pour SUPPLIER, créer/activer une liaison par consentement explicite des deux parties avec un compte global et une fiche métier compatible; vérifier que la fiche métier reste distincte du compte et qu'aucun membership ERP n'est ajouté automatiquement.
3. Pour un autre type (p. ex. PROSPECT), vérifier que le catalogue des avantages apparaît **seulement** si le module RELATIONSHIP_BENEFITS est enabled et entitled, et que les règles d'audience, attribution et statut sont respectées.
4. Révoquer une liaison puis ouvrir directement son URL historique : l'accès aux nouveaux avantages doit être refusé, mais les données de l'entreprise légitimement conservées restent présentes.
5. Tester un membre non autorisé, un lien appartenant à un autre compte et un autre tenant : refus sans fuite d'information ni reprise de la capacité OTHER.
6. Ouvrir un avantage non supporté automatiquement (par exemple BOOKING sans adaptateur métier) : l'interface doit distinguer **demande** de **consommation réelle**; aucun statut CONSUMED fictif.
7. Mobile 320, 360, 390, 414 px et desktop 1024 px : vérifier historique, retours, français/anglais, mode sombre, clavier et absence de débordement.

## Preuves requises

- SHA exact de la PR, nombre de workflows réussis, aucune suppression de tests.
- Capture de la liaison SUPPLIER consentie, de la relation révoquée, de la situation d'entitlement refusé et du message utilisateur pour avantage non automatique.
- Vérification que la QA automatique parcourt 23 types et 15 avantages en classification, sans présenter 345 utilisations réelles.
- Validation écrite : **`E2E #916 BON`** uniquement après recette indépendante. Sans cette validation, PR #922 reste brouillon/non fusionnée.

**La fermeture des parents #886/#785 est strictement interdite avant #917–#921 et leur certification finale.**
