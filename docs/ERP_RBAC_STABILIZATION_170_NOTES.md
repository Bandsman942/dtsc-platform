# Note de compatibilité #170

`canAccessEnterpriseModule` est conservé temporairement pour les adaptateurs spécialisés existants, mais ne contient plus de logique propre : il délègue au résolveur canonique. Sa suppression physique relève du nettoyage legacy final #173.
