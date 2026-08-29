# Hotfix #529 — formulaires guidés Retail : Mobile Money et Point de vente

Suivi livraison : Issue #529.

## Contexte

Le parcours Shop avait évolué fonctionnellement plus vite que son contrat de formulaire. Deux écrans critiques pouvaient donc disposer de données Finance valides côté serveur tout en restant difficiles, voire impossibles, à exploiter depuis l’interface : confirmation rendue sous le viewport mobile, CTA sans explication exploitable, informations contextuelles insuffisantes et dépendances métier non rendues visibles.

Le périmètre de ce hotfix reste volontairement limité à `MOBILE_MONEY_AGENCY` et `RETAIL_POS`. Le module Télécom conserve son workspace existant afin de ne pas introduire une refonte non demandée dans la même livraison.

## Agence Mobile Money

Le workspace professionnel est renforcé pour :

- conserver toutes les sessions de caisse ouvertes et leur sélection synchronisée ;
- faire de la caisse sélectionnée la source de la devise d’opération ;
- ne proposer que les opérateurs disposant d’un wallet mappé dans cette devise ;
- afficher le wallet automatiquement, sans permettre au navigateur d’en choisir arbitrairement un autre ;
- exposer le mode d’exécution `MANUAL` / `CONNECTED` sans exposer de secret d’intégration ;
- afficher la référence opérateur uniquement lorsque le mode manuel l’exige ;
- ajouter aides contextuelles, signalement des obligations et erreurs par champ ;
- ouvrir une revue plein écran avant toute mutation financière ;
- conserver les saisies et la revue lorsqu’une mutation backend échoue ;
- conserver le transfert de devise Mobile Money avec sa prévisualisation ;
- conserver une contrepassation contrôlée par dialogue, sans `window.prompt`.

Le backend reste l’autorité : il revalide la caisse, la session du caissier, la devise et résout de nouveau le wallet canonique par organisation + opérateur + devise. Le navigateur continue d’envoyer `floatAccountId: null`.

### Référence opérateur conditionnelle

L’API de configuration Mobile Money enrichit les opérateurs avec une information métier `executionMode` :

- `MANUAL` : la référence opérateur est affichée et obligatoire avant la revue ;
- `CONNECTED` : la saisie manuelle de référence est masquée et l’intégration/provider reste l’autorité du statut et de la référence.

Aucun credential, secret webhook ou référence sensible d’intégration n’est exposé par cette API.

## Point de vente

Le Point de vente applique les mêmes principes DTSC :

- toutes les caisses ouvertes de l’utilisateur sont disponibles dans un rail horizontal et une combobox synchronisée ;
- chaque paiement cash choisit explicitement une caisse ouverte compatible avec la devise du ticket ;
- les paiements non cash utilisent uniquement les comptes financiers actifs de l’entreprise dans la devise du ticket ;
- le paiement fractionné n’apparaît que lorsqu’il est activé et contrôle deux comptes distincts ;
- la somme des paiements doit correspondre au total avant la revue ;
- les champs panier et paiement disposent d’aide contextuelle et de signalement des obligations ;
- le motif de dérogation de prix/remise n’apparaît que lorsqu’une dérogation existe réellement ;
- `Vérifier la vente` ouvre une revue plein écran avec le panier, le dépôt et les encaissements ;
- la vente n’est écrite qu’après confirmation explicite ;
- la contrepassation du ticket utilise un dialogue contrôlé avec motif obligatoire, sans `window.prompt`.

Le serveur conserve les validations de stock, prix, remise/taxe, tenant, compte financier, session de caisse, idempotence et comptabilisation.

## Formulaires et i18n

Les nouveaux textes de guidage sont externalisés dans :

- `locales/retail-transaction-forms.fr.json` ;
- `locales/retail-transaction-forms.en.json`.

Les deux parcours exposent des aides sous les contrôles métier importants, des marqueurs d’obligation, des erreurs locales et un toast global. Les étapes de confirmation utilisent le `Dialog` DTSC en présentation `editor`, avec une hauteur adaptée au plein écran mobile.

## Sécurité et données

Aucune migration Prisma n’est introduite par ce hotfix.

Les nouveaux écrans ne créent ni caisse, ni wallet, ni compte financier, ni solde fictif. Les comboboxes sont alimentées par les données existantes de l’entreprise. Les routes d’écriture continuent à revalider `organizationId`, permission, statut, type de compte, devise et session utilisateur.

La référence client ou financière affichée dans le navigateur ne devient jamais une autorité : le backend conserve les contrôles canoniques avant écriture.

## QA permanente

`scripts/qa-529-retail-guided-review.mjs` vérifie statiquement que :

- Mobile Money reste routé vers son workspace professionnel renforcé ;
- le POS est routé vers son workspace DTSC multi-caisses ;
- le module Télécom reste sur son workspace existant et hors périmètre #529 ;
- les sessions multi-caisses sont consommées par le POS et Mobile Money ;
- Mobile Money dispose du mode d’exécution sans fuite de secrets ;
- les deux parcours utilisent validation explicite et revue plein écran avant mutation ;
- les workspaces routés n’utilisent pas `window.prompt` ;
- les résolveurs serveur du wallet et la validation de session de caisse restent en place ;
- les nouveaux textes de formulaire existent en français et en anglais.

Cette QA est ajoutée au runner de régression CI. Les gates existantes Retail/Shop restent également applicables.

## Rollback

Le rollback consiste à revenir au workspace POS précédent, au rendu Mobile Money précédent et à retirer l’enrichissement `executionMode` de l’API de configuration. Aucun rollback de données ni migration inverse n’est nécessaire.

## Validation propriétaire attendue

Avant fusion, le propriétaire doit vérifier sur mobile au minimum :

1. Mobile Money : CDF et USD visibles, opérateur/wallet cohérents, référence conditionnelle, erreur précise, revue plein écran puis transaction valide.
2. Point de vente : plusieurs caisses visibles, choix cash explicite, panier et paiements guidés, erreur de somme explicite, revue plein écran puis ticket valide.
3. Point de vente : contrepassation d’un ticket via dialogue contrôlé avec motif obligatoire.

La fusion vers `main` et la vérification Production restent bloquées tant que `OWNER_E2E` n’est pas fourni.
