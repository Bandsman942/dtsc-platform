# Liens profonds ERP

`buildEnterpriseObjectDeepLink` construit une route canonique :

```text
/enterprise-modules/{MODULE}?recordId={ID}&entityType={TYPE}&tab={ONGLET}&section={SECTION}&action={ACTION}&returnTo={CHEMIN}
```

`recordId` ouvre l’objet précis. `tab`, `section` et `action` orientent la vue. `returnTo` n’accepte qu’un chemin interne et restaure le retour vers la liste. Les listes conservent recherche, filtres, pagination et onglet dans l’URL. Une notification ne pointe jamais seulement vers la racine du module.

Les entités inconnues ne reçoivent pas de lien inventé : le helper retourne `null` et l’audit signale le mapping absent.
