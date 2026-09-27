# Migration ETF + Patrimoine — état de reprise

## Objectif, décisions et contraintes

ETF héberge l'application locale Patrimoine, PEA, budget et simulation d'achats : React compilé, serveur Python limité à `127.0.0.1`, SQLite hors dépôt. Travail en agent unique. Le simulateur statique reste utilisable sur GitHub Pages ; les écrans privés exigent l'API locale. Réel, cible et simulation restent distincts. Les pushes de code ont été autorisés le 27 septembre 2026. Aucun ordre ni suppression du projet Patrimoine n'est autorisé. Les recettes utilisent uniquement des données fictives.

## Checkout, fichiers et processus

- Checkout utilisé : racine de ce dépôt ETF, branche `main`. Migration dans `a90a7e8`, lanceur macOS nommé dans `c4ce31b` ; vérifier le SHA courant avec `git log -1 --oneline` avant de reprendre. Sources concernées : `local_{server,data,pea,budget}.py`, `app/src/local/`, `app/src/{App,PortfolioMvp,main}.jsx`, `app/src/migration/MigrationPlanner.jsx`, `run-local.{sh,command,cmd}`, `Champ libre.command`, tests `test_local_*.py` et `app/src/local/investment.test.js` ; documentation dans `README.md`, `PROJECT.md`, `app/README.md`, ce suivi et `PLAN-FUSION.md`.
- Modifications non validées à la clôture de cette étape : aucune modification du code. `PROMPT-ORCHESTRATEUR.md` demeure non suivi et exclu du commit. Vérifier `git status --short --branch` à la reprise. Le raccourci Bureau personnel reste hors dépôt ; le lanceur versionné est `Champ libre.command` à la racine.
- Processus locaux encore actifs : aucun serveur ni test lancé pour cette étape documentaire. Le push sur `main` déclenche automatiquement GitHub Pages ; contrôler le dernier workflow après chaque push. Les déploiements de `a90a7e8` et `c4ce31b` ont réussi.
- Le projet Patrimoine et ses données sources sont préservés hors dépôt. Aucune donnée patrimoniale réelle, base SQLite ou sauvegarde personnelle n'a été copiée dans ETF ou publiée.

## Étapes validées et contrôles

- **0 — État initial** : deux projets, Git et instructions inspectés ; référence ETF avant migration : 41 tests, lint et build réussis.
- **1 — Stockage et sauvegarde** : schéma SQLite v1→v4, sauvegarde avant migration, restauration atomique après contrôles d'intégrité/version/schéma et copie préalable, export JSON, reprise des trois clés navigateur. Contrôles Host/Origin/en-tête. Rechargement, redémarrage, restauration dans une autre base et refus des fichiers invalides validés avec données fictives.
- **2 — Patrimoine et crédit** : import après aperçu, identifiants stables, historique daté, propriété/usage explicites, dette liée et reliquat conservés. Totaux vérifiés à dates égales sur fixtures fictives ; enfants et prévisionnel exclus.
- **3 — PEA** : import CSV/tableau complet ou partiel, unités contrôlées, inconnus conservés, anti-doublon, annulation et rapprochement avec ancien agrégat. Deux relevés, doublon, ligne absente, transfert et absence de double comptage testés.
- **4 — Budget et cible** : comptes, liquidités sélectionnées, réserves soustraites une fois, capacité mensuelle séparée, versement plafonné et cible copiée sans modifier le réel ; tests et interface contrôlés.
- **5 — Investissement** : parts entières sans vente, prix datés, règles de frais configurables, positions inconnues et centimes conservés ; simulation sans effet sur le réel. Petit budget, offre expirée, prix périmé et seuil non atteint testés.
- **6 — Recette** : parcours fictif complet de patrimoine, PEA, budget, cible, plan, nouveau relevé, transfert, redémarrage, sauvegarde/restauration et refus d'entrées invalides. Site statique et interface locale à 390 px contrôlés dans Chrome. Python **12/12**, JavaScript **44/44**, lint et build réussis ; avertissement non bloquant sur la taille du bundle.
- **7 — Publication autorisée** : `a90a7e8` poussé après revue de l'index et nouveau passage des **12** tests Python, **44** tests JavaScript, lint, build et `git diff --cached --check`. Déploiement GitHub Pages réussi ; aucun fichier privé indexé.
- **8 — Lanceur** : `Champ libre.command` versionné dans `c4ce31b`, README clarifié. Syntaxe `sh -n`/`zsh -n`, lancement `--help` du fichier du projet et du raccourci Bureau réussis. Déploiement Pages réussi. Aucun calcul modifié, donc tests financiers non répétés.
- **9 — Reprise documentaire** : plan, suivi et guide de reprise cohérents ; chemins personnels retirés des documents versionnés. Contrôle ciblé du contenu et de l'index avant publication ; aucun changement de code.

## Problèmes ouverts et prochaine action

- L'automatisation du sélecteur de fichier Chrome a échoué après deux obstacles : l'extension ChatGPT n'avait pas l'accès aux URL de fichiers et l'événement de téléchargement a expiré. Export présent sur disque, import API et reprise UI validés ; l'import via sélecteur dans un navigateur ordinaire reste à vérifier manuellement. Ne pas répéter ces essais automatisés sans changement de permission ou de méthode. Un export fictif de test reste dans Téléchargements ; sa suppression par `rm -f` a été rejetée par la revue automatique, sans contournement.
- Lanceurs Windows et Linux fournis mais non exécutés sur ces OS. Format Fortuneo spécifique à adapter seulement avec un exemple anonymisé. Vérifier éligibilité, cours et frais avant tout ordre. Droits des données Fortuneo/Amundi et licence du code à décider avant diffusion supplémentaire.
- **Prochaine action précise** : sur la machine de destination, lancer l'application locale, sauvegarder les originaux Patrimoine, importer les données personnelles dans la base utilisateur hors dépôt, comparer totaux/historique/crédit aux mêmes dates, puis exporter une sauvegarde SQLite vers un support indépendant. Conserver Patrimoine et décider séparément de son éventuel archivage. Tester les lanceurs Windows/Linux sur ces OS si utilisés.
