# Reprise du projet ETF

Avant de modifier l'application, lire la section « Décision à conserver lors des prochaines sessions » de `PROJECT.md`. `MIGRATION-STATUS.md` contient aussi des étapes historiques dont certaines consignes d'import sont désormais périmées.

- SQLite est le seul stockage persistant de l'application locale. Confirmer une sauvegarde dans l'interface seulement après la réponse positive de l'API.
- Le site public explore les ETF en mémoire uniquement ; ses essais disparaissent au rechargement. Ne pas réintroduire `localStorage`, une synchronisation navigateur/SQLite ou des boutons de sauvegarde trompeurs.
- Les imports de l'ancien Patrimoine et des anciennes clés du navigateur ont été retirés du parcours standard. Une reprise supplémentaire éventuelle se traite ponctuellement, après sauvegarde et contrôle, sans parcours permanent pour tous les utilisateurs.
- Conserver la sauvegarde et la restauration SQLite ainsi que l'import métier des relevés PEA actuels. Préserver les bases SQLite et les fichiers du projet Patrimoine d'origine.
- La table SQLite `browser_data` conserve son nom pour compatibilité avec les bases et sauvegardes existantes ; ce nom n'indique pas l'usage de stockage navigateur.
- Pour vérifier le code : `python3 -m unittest discover -p 'test_local_*.py'` à la racine ; `npm test`, `npm run lint` et `npm run build` dans `app/`.
