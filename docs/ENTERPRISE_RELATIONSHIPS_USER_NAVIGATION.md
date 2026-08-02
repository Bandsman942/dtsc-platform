# Navigation utilisateur — Relations avec les entreprises

## Statut du module

Le module **Relations avec les entreprises** est un module global du compte DTSC. Il n’appartient pas à l’entreprise actuellement sélectionnée et doit fonctionner sans organisation active.

## Source unique

La configuration canonique est définie dans `lib/navigation/company-relationships.ts` :

- code : `COMPANY_RELATIONSHIPS` ;
- route : `/enterprise-links` ;
- libellé français : `Relations avec les entreprises` ;
- libellé anglais : `Company relationships` ;
- libellé mobile court : `Entreprises` / `Companies` ;
- ordre et icône centralisés.

## Points d’accès

Le module est disponible depuis :

- navigation principale desktop ;
- en-tête et rail mobile ;
- deuxième ligne mobile défilante ;
- menu du compte ;
- notifications ;
- liens profonds.

Il reste disponible dans les contextes :

- compte global standard ;
- aucune organisation active ;
- organisation cliente active ;
- contexte DTSC interne lorsque le compte y a accès.

## État actif

La route et ses sous-routes affichent l’état actif avec `aria-current="page"`. Sur mobile, l’élément actif de la deuxième ligne est ramené automatiquement dans la zone visible.

## Badge

Le badge ne compte que les éléments nécessitant une décision de l’utilisateur :

- invitation reçue ;
- consentement requis.

Les relations actives ou historiques ne sont pas comptées. Le badge est borné à `99+`.

## Workspace

1. **À traiter** : invitations et consentements.
2. **Relations actives** : entreprise, type de relation, activation et retrait d’autorisation.
3. **Mes demandes** : demandes initiées par l’utilisateur, statut et annulation.
4. **Historique** : refus, expiration, révocation et annulation.

## Notifications et liens profonds

Une notification de relation est globale, privée à l’utilisateur et ne dépend pas du contexte de l’entreprise invitante. Elle doit ouvrir :

```text
/enterprise-links?token=<jeton privé>
```

ou, lorsqu’aucun secret n’est nécessaire :

```text
/enterprise-links?link=<identifiant interne>&view=<vue>
```

Le jeton ne doit jamais être journalisé. Le lien doit mener à l’objet précis et à l’action attendue.

## Sécurité

- Aucune liste publique des entreprises ou utilisateurs.
- Demande utilisateur par code d’entreprise communiqué hors plateforme.
- Consentement explicite.
- Isolation utilisateur.
- Révision optimiste pour les décisions concurrentes.
- Révocation retirant les accès dérivés sans supprimer le dossier métier.
