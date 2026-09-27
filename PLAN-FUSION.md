# Plan exécutable — fusion ETF et Patrimoine

## Instruction pour la session de reprise

Les étapes 0 à 8 de ce plan ont été réalisées. Lire d'abord `MIGRATION-STATUS.md`, puis vérifier l'état réel du code, de Git et des données locales avant de poursuivre la prochaine action. Ne pas recommencer les étapes déjà validées sans raison. Préserver les changements existants et actualiser le suivi après chaque nouvelle étape.

Ce document contient les décisions produit prises avec l'utilisateur. Les choix techniques de détail peuvent être résolus pendant l'implémentation. En cas d'information utilisateur manquante, poursuivre les travaux indépendants et expliciter le point à compléter ; ne pas inventer les données financières ou les formats du courtier.

À l'origine, la mise en œuvre n'autorisait ni publication distante, ni passage d'ordre, ni suppression du dossier Patrimoine. Le propriétaire a ensuite autorisé le push sur `main` le 27 septembre 2026 ; les commits `a90a7e8` et `c4ce31b` ont été poussés et GitHub Pages a publié le simulateur statique. Aucun passage d'ordre ni suppression de Patrimoine n'est autorisé. L'archivage final doit être préparé et documenté ; la suppression éventuelle fera l'objet d'une décision séparée.

## 1. Objectif et décisions actées

Faire évoluer l'application ETF vers un outil unique permettant de :

1. Mesurer le patrimoine du foyer et distinguer les avoirs, dettes, réserves et projets.
2. Définir un budget d'investissement en tenant compte de ce contexte.
3. Concevoir une allocation cible pour le PEA, initialement à partir du catalogue Amundi existant.
4. Préparer les prochains achats et suivre le portefeuille réel sans double saisie.

Décisions actées :

- ETF est le projet principal. Les fonctions utiles de Patrimoine y sont portées progressivement.
- Conserver React/Vite et les moteurs de calcul ETF existants.
- Application web locale : interface dans le navigateur, petit serveur Python sur l'ordinateur, SQLite sur disque.
- Cible multiplateforme Windows/macOS/Linux. Aucun besoin d'application Mac native pour ce MVP.
- Fonctionnement personnel sur un ordinateur à la fois. Pas de synchronisation multi-appareils ni de collaboration simultanée.
- SQLite est la source de vérité. `localStorage` peut conserver des préférences d'interface, mais ne doit plus être le stockage unique des données métier.
- Sauvegarde manuelle : l'application exporte un fichier cohérent ; l'utilisateur le copie sur Drive ou disque externe. Aucun connecteur cloud, compte cloud, synchroniseur ou chiffrement applicatif à construire dans ce MVP. Expliquer que les sauvegardes contiennent des données personnelles en clair.
- Favoriser l'import de situations du PEA et le copier-coller de tableaux. Ne pas exiger un historique exhaustif des opérations.
- Open source : séparer strictement code/données publiques et données personnelles. Ne pas ajouter de données patrimoniales réelles aux commits, fixtures, captures de démonstration ou builds publics.

## 2. Projets et références à examiner

Emplacements à retrouver sur la machine de reprise :

- Projet principal : racine de ce dépôt ETF.
- Projet source privé à préserver : dossier Patrimoine local, distinct de ce dépôt (dossier frère sur la machine d'origine). Ne jamais présumer qu'il est présent dans un clone.

Dans ETF, lire `README.md`, `PROJECT.md`, `app/README.md`, `COMPOSITIONS.md`, les éventuels `AGENTS.md` applicables et :

- `app/src/PortfolioMvp.jsx` : interface et calculs historiques.
- `app/src/allocation/` : constructeur et comparateur.
- `app/src/portfolio/` : bibliothèque, portrait et stockage.
- `app/src/migration/` : portefeuille réel et planification sans vente.
- `app/src/data/` et catalogues JSON : données publiques, dates et sources.
- `.github/workflows/pages.yml`, `.gitignore`, `app/vite.config.js`.

Dans Patrimoine, lire le README, `serveur.py`, `dashboard.js`, `editor.js`, `scenario.js`, `credit.js` et les modèles de données. Les fichiers personnels incluent `patrimoine.csv`, `amortissement.csv`, `credit.json` et leurs sauvegardes : les traiter comme données privées.

Constats lors de l'analyse initiale, à revérifier :

- 41 tests ETF passent ; le lint passe.
- Le catalogue documente 54 ETF et 51 compositions. Ne pas figer ces nombres comme invariants.
- Le patrimoine identifie actuellement un poste par type/catégorie/libellé : un renommage peut créer un doublon historique.
- Le simulateur patrimoine utilise des allocations génériques et reconnaît certains actifs à leur libellé. Ne pas reprendre cette logique comme moteur de décision.
- Le portefeuille réel ETF stocke surtout des montants ; l'enregistrement des achats ne constitue pas un journal complet de transactions.
- Le stockage navigateur ETF est lié à l'origine. Les paniers du site public ne sont pas accessibles automatiquement depuis le futur serveur local.
- Le dépôt ETF publie sur GitHub Pages à chaque mise à jour de `main`. Les deux premiers pushes de migration ont été explicitement autorisés ; vérifier l'index et les données privées avant tout push ultérieur.

## 3. Parcours cible

Quatre espaces, avec navigation simple :

| Espace | Rôle |
| --- | --- |
| Vue d'ensemble | Patrimoine, dette, réserves, PEA, ancienneté des données et points à vérifier. |
| Mon cap | Projets, budget ponctuel et mensuel, scénarios d'allocation et cible active. |
| Mon PEA | Situation réelle, import, espèces, quantités/valorisations et écarts à la cible. |
| Prochain investissement | Versement envisagé, achats proposés, contraintes, frais et effet avant/après. |

Réutiliser le constructeur et les analyses ETF au sein de Mon cap. Conserver le catalogue et les analyses avancées en accès secondaire. Le portefeuille réel doit devenir directement accessible, sans devoir partir d'un panier simulé.

L'édition du patrimoine reste simple, avec tableaux et champs lisibles, plutôt qu'une exposition du schéma SQL. Conserver les aides pertinentes et le détail du crédit ; retirer du parcours principal les profils patrimoniaux génériques et les contributions historiques approximatives par pays/secteur. Ne pas supprimer leurs sources avant d'avoir terminé le remplacement.

## 4. Architecture et règles des données

### Architecture locale

- Interface React compilée servie par le serveur Python, avec API sur la même origine.
- SQLite via la bibliothèque standard Python ; éviter une infrastructure supplémentaire sans besoin démontré.
- Serveur lié uniquement à l'interface de boucle locale. Valider les entrées et protéger les écritures contre les requêtes provenant d'autres sites ; ne pas ouvrir une API locale sans restriction d'origine.
- Répertoire de données utilisateur hors du dépôt et du build, adapté à chaque OS, avec possibilité de choisir un autre emplacement local.
- Chemins construits de façon portable. Ne pas dépendre de chemins personnels codés en dur.
- Versions du schéma et migrations explicites. Transactions pour les imports et modifications liées.
- La version compilée ne nécessite ni Node ni Vite chez l'utilisateur. Pour le MVP source, documenter le prérequis Python et fournir des lanceurs adaptés. Les exécutables autonomes, signatures et mises à jour automatiques sont hors périmètre initial.

### Modèle minimal

Concevoir un schéma sobre permettant au minimum :

- Postes patrimoniaux avec identifiant stable, type, propriété, statut et usage ; comptes/enveloppes identifiés séparément du type des actifs détenus.
- Valorisation datée et date de vérification distinctes, avec provenance.
- Échéanciers de crédit explicitement liés aux dettes.
- Compte PEA avec espèces et positions par ISIN ; quantité et valorisation datées, avec état incomplet possible si l'ancienne donnée n'est qu'un montant.
- Situations importées et lots d'import permettant aperçu, détection des doublons et retour arrière.
- Scénarios/paniers, cible active copiée/versionnée et réglages du constructeur.
- Projets, réserves chiffrées et budgets déclarés, sans construire une comptabilité complète des dépenses.

Ne pas confondre titulaire du compte et classification patrimoniale de propriété. Ne pas déduire un statut juridique du libellé. Préserver les valeurs inconnues.

### Invariants à préserver

- Le total du PEA est compté une seule fois : espèces + positions. Il remplace sa représentation agrégée liée, sans s'y ajouter.
- Une correspondance ambiguë entre anciennes lignes et compte PEA doit être confirmée. Ne pas fusionner toutes les lignes contenant « PEA » par défaut.
- Un transfert entre comptes du foyer conserve le patrimoine total hors frais ; il ne crée pas un revenu ou un gain de performance.
- Un achat transforme des espèces en titres ; un projet d'achat ne modifie jamais la situation réelle.
- Une nouvelle situation de portefeuille est un relevé, pas un achat à additionner au précédent.
- Un écart entre deux relevés ne permet pas d'inférer automatiquement versement, retrait, gain ou dividende.
- Les simulations, la cible et le réalisé restent séparés. Le chargement d'un panier ne change pas la cible active sans action explicite.
- Enfants/hors foyer et prévisionnel restent exclus des totaux actuels du foyer. Les réserves restent dans le patrimoine mais réduisent les sommes mobilisables.
- Conserver les règles de dette liée, y compris échéances supposées payées et reliquat final non forcé à zéro.
- Conserver les historiques d'origine lors du passage d'une valeur globale à un PEA détaillé, avec date d'effet et provenance explicites.

## 5. Étapes d'implémentation

### Étape 0 — État initial et protection de la migration

- Inspecter le statut Git, les instructions locales et les deux projets. Préserver les modifications présentes.
- Exécuter les tests, lint et build ETF de référence et noter les résultats.
- Identifier les données privées et les exclusions nécessaires avant toute copie.
- Inventorier les fonctions conservées, adaptées et retirées ; préciser le schéma et les interfaces de stockage.
- Ne pas modifier les fichiers source personnels de Patrimoine. Faire les essais avec des données fictives et importer les données réelles uniquement dans le stockage privé local.

Livrable : état initial documenté et architecture minimale précisée dans les documents du projet.

### Étape 1 — Stockage SQLite, serveur et sauvegarde/restauration

- Créer le serveur local, le schéma versionné et l'accès aux données ; intégrer le service des fichiers React compilés.
- Ajouter une couche d'accès aux données côté React, en conservant les moteurs de calcul purs.
- Porter la persistance des paniers, cibles et situations réelles vers SQLite.
- Fournir un export des anciennes clés navigateur `champ-libre.workspace.v1`, `champ-libre.migration.v1` et, si présente, `champ-libre.allocation-models.v1`, puis un import validé. Expliquer comment exporter depuis l'origine qui détient les données ; ne jamais effacer le stockage source automatiquement.
- Exporter une sauvegarde SQLite cohérente via l'API de sauvegarde, pas une copie brute de la base ouverte.
- Restaurer seulement après validation du fichier, de son intégrité et de sa version ; sauvegarder l'état précédent, fermer les connexions et remplacer de façon sûre. Un fichier invalide ne doit pas endommager la base courante.
- Ajouter un export JSON versionné pour la portabilité et un CSV des tableaux utiles si cela reste simple ; la sauvegarde SQLite complète est prioritaire.

Validation : fermeture/réouverture sans perte, reprise des paniers existants, sauvegarde puis restauration dans une base vierge avec données équivalentes ; restauration invalide refusée sans perte.

### Étape 2 — Patrimoine dans l'interface ETF

- Porter inventaire, historique, totaux, propriété, usage, dates de vérification et crédit dans React.
- Importer les anciens CSV et métadonnées de crédit avec aperçu et rapport ; préserver toutes les valeurs d'origine utiles.
- Introduire les identifiants stables. Un renommage ne crée plus un nouveau poste historique.
- Remplacer les classifications déduites des libellés par des champs explicites ; conserver les cas non précisés.
- Ajouter la navigation commune et les écrans vides explicatifs.

Validation : à dates et périmètres identiques, totaux et dette conformes à l'ancien outil ; avoirs hors foyer/prévisionnels correctement isolés ; historique conservé.

### Étape 3 — Import du PEA et suppression de la double saisie

- Construire un import générique CSV et copier-coller tabulaire avec choix des colonnes : ISIN, libellé, quantité, valorisation et éventuellement cours. Demander séparément les espèces et la date si absentes.
- Accepter les conventions françaises de nombres et les séparateurs courants ; ne pas deviner silencieusement une unité ou une colonne ambiguë.
- Présenter l'aperçu, les changements et les incohérences avant validation.
- Gérer explicitement relevé complet et mise à jour partielle. L'absence d'une ligne ne vaut pas automatiquement vente.
- Conserver les positions inconnues/hors catalogue dans le réel et dans les totaux ; signaler les limites d'analyse sans les supprimer.
- Rendre l'import répétable sans duplication, transactionnel et annulable.
- Proposer le rapprochement des anciennes lignes PEA et contrôler l'écart entre total importé et ancienne valorisation. Après validation, le patrimoine lit le total du compte détaillé.
- Laisser une édition manuelle simple en secours.

Un format Fortuneo spécifique ne peut être promis sans exemple réel anonymisé. En son absence, terminer l'import générique et documenter le besoin d'exemple. Ne pas inclure PDF/OCR, identifiants bancaires ou scraping de l'espace client dans le MVP.

Validation : premier import, deuxième relevé, même fichier deux fois, import partiel, position inconnue, ligne absente, nombres ambigus, annulation et absence de double comptage.

### Étape 4 — Budget d'investissement et cible

- Permettre de choisir les comptes de financement, les réserves/projets à préserver et leurs montants/échéances.
- Distinguer capacité mensuelle déclarée et argent déjà disponible, afin de ne pas compter un futur versement deux fois.
- Construire un budget ponctuel explicable à partir des sommes mobilisables et des choix de l'utilisateur ; ne pas assimiler tout poste « libre » à des espèces disponibles.
- Afficher séparément patrimoine net, patrimoine financier et budget mobilisable. Immobilier et héritage attendu ne financent pas automatiquement le PEA.
- Préserver les informations de propriété et ne pas supposer que toutes les liquidités du foyer sont affectables au PEA d'un individu.
- Conserver un horizon et un niveau de risque déclarés ; ne pas convertir quelques réponses en recommandation automatique prétendument personnalisée.
- Relier ce cadre au constructeur ETF et sélectionner une cible active explicite.

Validation : réserves non comptées deux fois, budget disponible explicable, aucune cession automatique, changement de scénario sans modification des avoirs.

### Étape 5 — Prochain investissement

- Alimenter le planificateur existant avec la situation réelle et le budget retenu, plutôt qu'une nouvelle saisie des avoirs.
- Préserver le mode sans vente et les calculs testés, notamment les centimes, les positions hors cible, les prix datés et les frais.
- Ajouter des règles de courtage configurables, datées et sourcées : courtier, instruments concernés, seuil par ordre, période de validité et tarif hors offre. Revérifier les conditions officielles au moment de l'implémentation ; ne pas figer la gratuité Amundi.
- Comparer des achats réalisables en parts entières en tenant compte des seuils, frais et liquidités restantes. Si nécessaire, proposer moins d'ordres ou conserver une partie du budget. Ne pas augmenter le budget pour bénéficier d'une promotion.
- Expliquer l'écart à la cible et les hypothèses ; ne pas annoncer un optimum global si l'algorithme est heuristique.
- Conserver distincts cours indicatifs, VL mensuelles et prix exécutés. Ne pas utiliser l'historique mensuel comme cours d'achat actuel.
- Après achats, privilégier un nouveau relevé importé pour actualiser le réel. Si une saisie rapide d'opération est conservée, assurer le transfert source/destination, les frais et la réconciliation avec le prochain relevé sans duplication ; sinon retirer l'ancien bouton qui ne mettrait à jour qu'une partie des données.
- Ne pas afficher de performance réelle issue des variations de valeur tant que les flux nécessaires ne sont pas connus. Les simulations historiques gardent leurs libellés et limites.

Validation : petit budget, seuil d'offre non atteint, offre expirée, prix absent/périmé, arrondis, positions hors cible et conservation du budget ; simulation sans effet sur les avoirs.

### Étape 6 — Distribution, documentation et recette finale

- Documenter lancement depuis les sources, production locale compilée, dépendances minimales et emplacement des données.
- Fournir des lanceurs adaptés aux trois OS sans imposer de chemins personnels ; indiquer lesquels ont réellement été testés. Ne pas prétendre valider Windows/Linux uniquement depuis macOS.
- Définir le comportement du site GitHub Pages existant : garder éventuellement le simulateur public autonome ; ne jamais présenter une application privée fonctionnelle si elle dépend d'une API locale absente. Ne pas publier cette décision sans autorisation.
- Vérifier les conditions de redistribution des données publiques et les licences existantes ; ne pas ajouter arbitrairement une licence au nom de l'utilisateur. Documenter ce qui reste à décider pour une publication open source formelle.
- Actualiser README et PROJECT avec architecture, migrations, limites, import et sauvegarde/restauration.
- Vérifier l'interface dans le navigateur avec les outils et skills applicables : navigation, tables, formulaires, erreurs, petite largeur et reprise après rechargement. Utiliser des données fictives pour les captures destinées au dépôt.
- Préparer une procédure d'archivage de Patrimoine après recette, avec inventaire de ses données et sauvegardes ; ne pas supprimer le dossier.

## 6. Recette de bout en bout indispensable

Sur une base de test fictive :

1. Importer un patrimoine avec logement, dette liée, liquidités, réserve, avoirs d'enfant et poste prévisionnel.
2. Contrôler les totaux et l'historique contre les valeurs attendues.
3. Importer un PEA et le rapprocher de son ancienne ligne agrégée : aucun doublon.
4. Créer un budget, construire/enregistrer une cible, préparer un achat en parts entières.
5. Vérifier que la simulation laisse le réel inchangé.
6. Actualiser la situation réelle ; si un transfert interne est enregistré, vérifier qu'il ne crée pas de patrimoine.
7. Réimporter le même relevé : aucun doublon.
8. Fermer puis rouvrir ; retrouver les mêmes données et cible.
9. Exporter, restaurer dans une autre base et retrouver le même état.
10. Tester une restauration invalide et un import incohérent : aucune perte de l'état précédent.

Préserver les tests ETF existants, ajouter des tests ciblés des invariants, migrations, imports et sauvegardes, puis exécuter lint/build. Les tests financiers doivent vérifier des résultats attendus ou des invariants indépendants, pas reproduire l'implémentation. Tester aussi le serveur Python. Documenter les limites de validation restantes.

## 7. Hors périmètre du MVP

- Synchronisation bancaire, connexion au compte courtier et passage d'ordres.
- Cloud applicatif, sauvegarde cloud automatique et synchronisation multi-appareils.
- Application native spécifique à macOS, installateurs signés et mises à jour automatiques.
- OCR/PDF universel, cours en temps réel et notifications de marché.
- Reconstitution obligatoire de toutes les transactions passées, fiscalité complète, rendement personnel calculé à partir de données incomplètes.
- Optimisation patrimoniale globale et cessions immobilières automatiques.
- Suppression définitive de Patrimoine ou publication distante sans demande distincte.

## 8. Suivi à tenir à jour pendant l'exécution

Pour chaque étape terminée, noter brièvement les fichiers/commandes utiles, les résultats de validation, les décisions prises et les limites restantes. Ce suivi doit permettre une nouvelle reprise sans relire une conversation.

- [x] 0 — État initial et protection des données.
- [x] 1 — SQLite, serveur, migration navigateur et sauvegarde/restauration.
- [x] 2 — Patrimoine et crédit dans React.
- [x] 3 — Import PEA et rapprochement sans double saisie.
- [x] 4 — Budget et cible active.
- [x] 5 — Planification des prochains achats.
- [x] 6 — Distribution, documentation et recette finale.
- [x] 7 — Push autorisé des sources publiques et déploiement du site statique.
- [x] 8 — Lanceur macOS nommé dans le dépôt, avec raccourci sur le Bureau.

Résultats, limites de validation et prochaine action : voir `MIGRATION-STATUS.md`, versionné avec ce plan pour les futurs clones. Les sources Patrimoine restent privées et en place ; aucun fichier de données personnelles n'a été publié. Le code public et le simulateur statique ont été publiés sur `main`.
