# Hotfix #529 — formulaires guidés Retail : Mobile Money, Point de vente et Télécom

Suivi livraison : Issue #529.

## Contexte

Le parcours Shop avait évolué fonctionnellement plus vite que son contrat de formulaire. Plusieurs écrans pouvaient donc disposer de données Finance valides côté serveur tout en restant difficiles, voire impossibles, à exploiter depuis l’interface : confirmation rendue sous le viewport mobile, CTA silencieusement bloqués, informations contextuelles insuffisantes et dépendances métier non rendues visibles.

Le diagnostic a aussi révélé une incohérence bloquante dans `TELCO_TOPUPS` : le workspace attendait une configuration opérateur multi-devise que le dashboard scoped Télécom ne renvoyait pas. Un réseau pouvait donc être provisionné avec ses comptes tout en apparaissant comme non éligible dans le formulaire.

## Agence Mobile Money

Le nouveau workspace guidé :

- conserve toutes les sessions de caisse ouvertes et leur sélection synchronisée ;
- fait de la caisse sélectionnée la source de la devise d’opération ;
- ne propose que les opérateurs disposant d’un wallet mappé dans cette devise ;
- affiche le wallet automatiquement, sans permettre au navigateur d’en choisir arbitrairement un autre ;
- expose le mode d’exécution `MANUAL` / `CONNECTED` sans exposer de secret d’intégration ;
- affiche la référence opérateur uniquement lorsque le mode manuel l’exige ;
- affiche l’encaissement des frais uniquement lorsqu’un frais client existe ;
- ajoute aides contextuelles, signalement des obligations et erreurs par champ ;
- ouvre une revue plein écran avant la mutation financière ;
- conserve les saisies et la revue lorsqu’une mutation backend échoue ;
- conserve le transfert de devise Mobile Money, avec prévisualisation du taux puis confirmation ;
- conserve une contrepassation contrôlée par dialogue, sans `window.prompt`.

Le backend reste l’autorité : il revalide la caisse, la session du caissier, la devise et résout de nouveau le wallet canonique par organisation + opérateur + devise.

## Point de vente

Le Point de vente applique désormais les mêmes principes :

- toutes les caisses ouvertes de l’utilisateur sont disponibles dans un rail horizontal et une combobox synchronisée ;
- chaque paiement cash choisit explicitement une caisse ouverte compatible avec la devise du ticket ;
- les paiements non cash utilisent uniquement les comptes financiers actifs de l’entreprise dans la devise du ticket ;
- le paiement fractionné n’apparaît que lorsqu’il est activé et contrôle deux comptes distincts ;
- la somme des paiements doit correspondre au total avant la revue ;
- les champs panier et paiement disposent d’aide contextuelle ;
- le motif de dérogation de prix/remise n’apparaît que lorsqu’une dérogation existe réellement ;
- `Vérifier la vente` ouvre une revue plein écran avec le panier, le dépôt et les encaissements ;
- la vente n’est écrite qu’après confirmation explicite ;
- la contrepassation du ticket utilise un dialogue contrôlé avec motif obligatoire.

Le serveur conserve les validations de stock, prix, remise/taxe, tenant, compte financier, session de caisse, idempotence et comptabilisation.

## Télécom

Le parcours Télécom a été refactorisé au même niveau :

- le dashboard `TELCO_TOPUPS` charge maintenant la configuration canonique opérateur/devise ;
- cette configuration expose aussi le mode d’exécution de chaque réseau, sans credential ni secret ;
- la chaîne caisse/compte d’encaissement → devise → réseaux éligibles → compte opérateur est visible et déterministe ;
- un compte opérateur de même devise est affiché automatiquement puis résolu de nouveau côté serveur ;
- en mode connecté, le statut manuel, le motif d’échec et la référence manuelle sont masqués : le provider connecté fait autorité ;
- en mode manuel, la référence est obligatoire pour une recharge réussie et le motif est obligatoire pour une recharge échouée ;
- une offre du catalogue peut préremplir libellé, prix et coût ; le libellé manuel n’est affiché que si aucune offre n’est sélectionnée ;
- la validation est explicite et remonte à la fois localement et par toast ;
- la revue de la recharge est plein écran et affiche réseau, téléphone, devise, compte d’encaissement, compte opérateur, coût et marge ;
- la contrepassation est un dialogue contrôlé et conserve l’historique d’audit.

## Sécurité et données

Aucune migration destructive n’est introduite par ce hotfix.

Les nouveaux écrans ne créent ni caisse, ni wallet, ni compte opérateur, ni solde fictif. Les comboboxes sont alimentées par les données existantes de l’entreprise. Les routes d’écriture continuent à revalider `organizationId`, permission, statut, type de compte, devise et session utilisateur.

Les modes provider sont exposés uniquement comme information métier `MANUAL` / `CONNECTED`. Les références de credentials, secrets webhook et paramètres sensibles ne sont pas envoyés au navigateur.

## QA permanente

`scripts/qa-529-retail-guided-review.mjs` vérifie statiquement que :

- les trois modules sont routés vers leurs workspaces guidés ;
- les sessions multi-caisses sont consommées par le POS/Télécom ;
- la configuration Télécom multi-devise est présente dans le dashboard ;
- Mobile Money et Télécom disposent du mode d’exécution sans fuite de secrets ;
- les trois parcours utilisent validation explicite et revue plein écran ;
- les workspaces routés n’utilisent pas `window.prompt` ;
- les résolveurs serveur de wallet/compte opérateur et la validation des sessions de caisse restent en place.

Cette QA est ajoutée au runner de régression CI. Les gates existantes Retail/Shop restent également applicables.

## Validation propriétaire attendue

Avant fusion, le propriétaire doit vérifier sur mobile au minimum :

1. Mobile Money : CDF et USD visibles, opérateur/wallet cohérents, référence conditionnelle, erreur précise puis revue plein écran et transaction valide.
2. Point de vente : plusieurs caisses visibles, choix cash explicite, panier et paiements guidés, revue plein écran puis ticket valide.
3. Télécom : réseau disponible après provisionnement, compte opérateur de même devise, mode manuel/connecté cohérent, champs conditionnels, revue plein écran puis recharge valide.

La fusion vers `main` et la vérification Production restent bloquées tant que `OWNER_E2E` n’est pas fourni.