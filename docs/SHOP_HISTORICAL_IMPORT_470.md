# Reprise historique Shop + comptabilisation Télécom — Issue #470

## 1. Objectif

Cette itération permet à un Shop déjà exploité sur papier de restituer ses premières opérations Mobile Money et Télécom dans DTSC sans les confondre avec les caisses courantes.

Le workflow de reprise est volontairement distinct des formulaires opérationnels : il conserve la date d'origine, contrôle les soldes de cutover, crée un historique de caisse fermé et exige une validation indépendante avant tout effet sur les comptes.

La même itération complète aussi la comptabilisation de `TELCO_TOPUPS` afin qu'une recharge réussie ne modifie plus seulement les soldes opérationnels : elle produit désormais une écriture Finance en partie double via le moteur de posting commun.

## 2. Avant de commencer

Préparer dans DTSC les vrais comptes déjà existants au point de départ de l'historique :

- chaque caisse `CASH` par devise ;
- chaque wallet Mobile Money `MOBILE_MONEY` réellement utilisé ;
- chaque float Télécom `MOBILE_MONEY` ou `CLEARING` réellement utilisé ;
- les mappings opérateur + devise correspondants ;
- des périodes comptables `OPEN` ou `SOFT_CLOSED` couvrant toutes les dates historiques à reprendre.

Le solde opérationnel courant de chacun de ces comptes doit être exactement le solde au début de la période que l'on souhaite rejouer. DTSC n'invente ni cash, ni float, ni coût opérateur, ni taux de change.

Si un compte contient déjà des opérations DTSC dans la période à reprendre, l'import est bloqué afin d'éviter une double comptabilisation.

## 3. Accès au workflow

Chemin métier :

`Shop > Clôture magasin > Reprise de l'historique du Shop`

Une personne disposant uniquement du droit de lecture peut consulter les reprises enregistrées. La préparation et l'application exigent le droit de gestion du module de clôture Retail.

La personne qui prépare une reprise ne peut pas l'appliquer elle-même. Une autre personne autorisée doit la contrôler et l'appliquer.

## 4. Préparer les soldes de départ

Pour chaque compte utilisé par les lignes historiques :

1. sélectionner le compte réel ;
2. conserver ou saisir son solde de départ ;
3. renseigner, si disponible, le solde final vérifié dans le cahier ou auprès de l'opérateur.

Le système ajoute automatiquement les mappings de float canoniques lorsque l'opérateur et la devise du compte principal permettent de les résoudre.

Le preview bloque notamment si :

- un compte ou un provider n'appartient pas à l'entreprise active ;
- le wallet/float de la devise n'est pas configuré ;
- un compte affecté ne possède pas de baseline explicite ;
- le solde courant n'est plus égal au solde de départ déclaré ;
- l'ordre historique produirait un solde insuffisant ;
- le solde final vérifié diffère du solde final calculé ;
- une référence opérateur existe déjà ;
- une date n'appartient à aucune période comptable autorisée.

## 5. Reprendre Mobile Money

Chaque dépôt/retrait historique conserve :

- date et heure d'origine ;
- wallet/opérateur ;
- type dépôt ou retrait ;
- téléphone client ;
- principal ;
- frais client ;
- commission opérateur déclarée ;
- mode de perception des frais ;
- caisse utilisée ;
- référence opérateur lorsque le cahier ou le SMS la fournit ;
- repère facultatif dans le cahier.

Effets canoniques :

### Dépôt client

- caisse : `+ principal + frais cash réellement encaissés` ;
- float : `- principal` ;
- différence cash/float : `SERVICE_REVENUE` lorsque les frais ont réellement été encaissés en cash.

### Retrait client

- caisse : `- principal + frais cash réellement encaissés` ;
- float : `+ principal` ;
- différence cash/float : `SERVICE_REVENUE` lorsque les frais ont réellement été encaissés en cash.

La commission annoncée par l'opérateur reste une donnée opérationnelle jusqu'à la constatation d'un crédit réel du provider.

## 6. Reprendre Télécom et forfaits

Chaque recharge historique conserve :

- date et heure d'origine ;
- réseau Télécom ;
- téléphone destinataire ;
- libellé de l'offre/forfait ;
- prix payé par le client ;
- coût réellement débité par l'opérateur ;
- compte d'encaissement ;
- référence opérateur lorsqu'elle existe ;
- repère facultatif dans le cahier.

Le coût opérateur ne doit jamais être remplacé par zéro uniquement pour compléter un import. La marge est calculée comme :

`marge = prix payé par le client - coût opérateur`

## 7. Nouveau contrat comptable TELCO_TOPUPS

Une recharge Télécom `SUCCESS` utilise désormais le moteur de posting Finance commun.

Écriture :

- débit du vrai compte d'encaissement pour `saleAmount` ;
- crédit du vrai float opérateur pour `operatorCost` ;
- crédit `SERVICE_REVENUE` pour `marginAmount` lorsque la marge est positive.

Le journal dépend du compte d'encaissement :

- caisse -> journal `CASH` ;
- Mobile Money -> journal `MOBILE_MONEY` ;
- banque ou clearing -> journal `BANK`.

La date comptable est la date réelle `occurredAt` de la recharge.

Événements :

- `RETAIL_TELCO_TOPUP_POSTED` ;
- `RETAIL_TELCO_TOPUP_REVERSED`.

L'annulation utilise exactement les comptes enregistrés sur la recharge d'origine ; une modification ultérieure du mapping opérateur ne déplace donc pas le reversal vers un autre float.

Le mode manuel et le mode provider connecté convergent vers le même finalizer comptable.

## 8. Preview sans écriture

`Prévisualiser la reprise` ne crée aucune opération métier, mouvement de trésorerie, session de caisse ou écriture comptable.

Le preview calcule :

- nombre de lignes Mobile Money et Télécom ;
- effet net par compte ;
- solde de départ ;
- solde final calculé ;
- concordance avec un solde final vérifié lorsqu'il est renseigné ;
- résolution effective du compte principal et du float par opérateur/devise.

Une reprise ne peut être enregistrée pour validation qu'après un preview cohérent.

## 9. Enregistrer puis appliquer

Après preview :

1. le préparateur enregistre la reprise ;
2. le document reste `DRAFT` ;
3. une autre personne autorisée contrôle le résumé ;
4. cette personne applique la reprise ;
5. le serveur revalide intégralement les soldes, périodes, providers, comptes et références ;
6. les opérations sont créées avec leur date historique ;
7. les mouvements Treasury utilisent leur date d'origine ;
8. les postings Mobile Money/Télécom utilisent le registre comptable commun.

La création du document et les lignes d'application utilisent des clés d'idempotence stables afin qu'un retry ne crée pas une seconde opération.

## 10. Sessions de caisse historiques

Le moteur de reprise ne réutilise jamais une session de caisse live `OPEN`.

Pour chaque caisse utilisée, il crée une session historique directement fermée :

- `openedAt` = début de la période ;
- `openingAmount` = baseline déclarée ;
- mouvements liés aux opérations importées ;
- `expectedClosingAmount` = solde final calculé ;
- `countedClosingAmount` = solde final vérifié lorsqu'il est fourni, sinon solde calculé ;
- écart = zéro, car toute divergence de solde final bloque le preview ;
- préparateur = personne ayant restitué le cahier ;
- validateur = personne indépendante ayant appliqué la reprise.

Une caisse `OPEN`, `CLOSING` ou `PENDING_VALIDATION` sur un compte concerné bloque l'application de l'historique.

## 11. Tolérance aux échecs et reprise

Les mutations opérationnelles de tout le lot sont réalisées dans une transaction `Serializable` avant les postings Finance.

Une fois les opérations métier créées, le document passe à `APPLYING`. Les IDs créés sont conservés dans le résultat interne du document.

Si un posting Finance échoue ensuite :

- les soldes opérationnels ne sont pas appliqués une seconde fois ;
- le document reste `APPLYING` ;
- un retry relance uniquement les finalizers idempotents manquants ;
- le document devient `APPLIED` uniquement lorsque tous les postings sont terminés.

## 12. Immutabilité et corrections

Une reprise `APPLIED` n'est ni supprimée ni réécrite silencieusement.

Une correction d'une opération déjà appliquée suit le workflow de reversal de l'opération Mobile Money ou Télécom concernée. Les écritures `POSTED` restent immuables.

Le document de reprise permet de retrouver les opérations qu'il a créées grâce aux identifiants conservés et aux clés d'idempotence `history:<importId>:<ligne>`.

## 13. Cas pratique pour un cahier Shop

Ordre recommandé :

1. fixer le cutover juste avant la première opération client à reprendre ;
2. créer/configurer les caisses CDF/USD et les floats opérateur avec les soldes réels à ce cutover ;
3. ouvrir les périodes comptables historiques nécessaires ;
4. saisir les baselines ;
5. saisir les dépôts/retraits et recharges dans l'ordre du cahier avec leurs vraies dates ;
6. renseigner les coûts opérateur des forfaits ;
7. renseigner les soldes de clôture connus ;
8. prévisualiser ;
9. enregistrer ;
10. faire appliquer par un second responsable ;
11. rapprocher les soldes DTSC avec le cash physique et les balances provider ;
12. seulement ensuite démarrer les opérations courantes dans les modules Mobile Money et Télécom.

## 14. Hors périmètre

Cette itération ne :

- reconnaît pas automatiquement des montants depuis une photo du cahier ;
- n'invente pas les références opérateur manquantes ;
- n'invente pas le coût d'une recharge ;
- ne reconstitue pas automatiquement des paiements fournisseurs absents du cahier ;
- ne permet pas de réécrire un import déjà appliqué ;
- ne contourne pas les périodes Finance fermées ;
- ne crée pas d'adaptateur provider externe fictif.

## 15. Rollback technique

La migration est additive. Un rollback applicatif peut retirer les surfaces et services de reprise sans supprimer la table déjà créée.

Une reprise métier déjà `APPLIED` ne doit pas être annulée par suppression SQL. Elle doit être corrigée par les reversals métier/comptables correspondants afin de préserver l'audit.
