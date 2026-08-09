# Implémentation #170

La route centrale et les services core/procurement consomment `resolveEnterpriseModuleCapabilities`. Les anciens helpers module sont des adaptateurs vers le même résolveur. Les décisions UI Procurement sont bornées par les capacités serveur et les relations objet déjà imposées par les routes API.
