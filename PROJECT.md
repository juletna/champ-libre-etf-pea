# Champ libre — guide de reprise du projet

## Migration locale en cours (septembre 2026)

Pour reprendre la migration, lire le [plan](PLAN-FUSION.md) et le [suivi d'étape](MIGRATION-STATUS.md), puis vérifier l'état réel du dépôt. Les étapes de construction et la recette fictive sont validées ; l'import des données personnelles et leur sauvegarde indépendante restent à faire sur la machine de destination.

Le serveur `local_server.py` crée une base SQLite versionnée hors dépôt, sert `app/dist`, contrôle les écritures locales et expose l’export/sauvegarde/restauration. `local_data.py`, `local_pea.py` et `local_budget.py` portent les modèles et calculs ; `app/src/local/` les interfaces. L’ancienne saisie de portefeuille dans `MigrationPlanner.jsx` reste réservée au site statique ; en local, le plan lit le PEA et le budget et recommande un nouveau relevé pour actualiser le réel. Les simulations de portefeuille et les données réelles ne se confondent pas. Exécuter les tests Python `python3 -m unittest -q test_local_server.py test_local_data.py test_local_pea.py test_local_budget.py` et, dans `app/`, `npm test`, `npm run lint`, `npm run build`.

Le build statique utilise `base: './'`. Sans API locale, la navigation privée ne s’affiche pas et le stockage reste dans le navigateur. Un push sur `main` publie automatiquement le site statique ; la migration locale est poussée avec l’accord du propriétaire. Aucune licence de code n’est présente dans ce dépôt. Les [mentions Fortuneo](https://www.fortuneo.fr/mentions-legales-avertissement-legal) restreignent la redistribution de leurs informations ; les [mentions Amundi](https://www.amundietf.fr/fr/particuliers/mentions-legales) et les droits des fournisseurs d’indices/données doivent être examinés avant une diffusion élargie. Les [données statistiques BCE](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html) sont réutilisables sous conditions d’attribution et de fidélité ; les conversions calculées doivent être signalées. Une décision de droits et licence reste nécessaire avant toute publication open source formelle. Ne pas ajouter une licence sans décision du propriétaire.

Archivage de Patrimoine après recette seulement : inventorier `patrimoine.csv`, `amortissement.csv`, `credit.json` et sauvegardes locales éventuelles ; exporter une sauvegarde SQLite vérifiée ; comparer les totaux, le crédit et l’historique à dates identiques ; conserver les originaux et une copie indépendante avant de décider séparément d’un archivage. Ne supprimer aucun fichier source dans cette migration.

Ce document décrit l'état du dépôt pour toute personne ou tout outil qui reprend le travail. Il complète les README et ne dépend d'aucun assistant particulier.

## Objectif et périmètre

L'application permet de composer un portefeuille **virtuel** d'ETF PEA de l'offre Fortuneo Amundi, puis d'observer son rendement mensuel simulé et ses expositions par pays, zone et secteur. Elle sert à explorer des allocations et à préparer des achats sans vente à partir d’un portefeuille réel saisi manuellement, sans passer d’ordre. Les 54 ETF du catalogue relevé le 26 septembre 2026 sont sélectionnables et disposent d'un historique mensuel ; 51 ont aussi une composition issue d'un reporting Amundi daté.

Site publié : <https://juletna.github.io/champ-libre-etf-pea/>. Un push sur `main` déclenche le workflow GitHub Pages dans `.github/workflows/pages.yml`.

## Démarrer et vérifier

À la racine du dépôt :

```bash
cd app
npm ci
npm run dev
```

Vite affiche l'adresse locale ; le build utilise des chemins relatifs (`base: './'`) pour fonctionner sur le site statique et le serveur local. Avant toute publication autorisée :

```bash
cd app
npm test
npm run lint
npm run build
```

Les calculs du constructeur, les sauvegardes locales et le plan de migration disposent de tests automatisés (`npm test`) ; le parcours historique reste à vérifier dans le navigateur. Vérifier dans le navigateur le choix de période, l'ajout et le retrait d'ETF, un poids à 0 %, les verrouillages, les yeux des courbes, le bouton global et les vues Pays/Zones. Contrôler que le rendement, sa période et les contributions des cartes changent ensemble.

## Carte du dépôt

| Fichier | Rôle |
| --- | --- |
| `app/src/PortfolioMvp.jsx` | État du portefeuille, calculs et interface React. |
| `app/src/portfolio-mvp.css` | Styles du tableau de bord. |
| `app/src/allocation/AllocationWizard.jsx` | Parcours de construction, cibles de zones verrouillables et enregistrement à l’application. |
| `app/src/allocation/AllocationComparison.jsx` | Tableau partagé de comparaison des propositions et des paniers enregistrés. |
| `app/src/allocation/engine.js` | Redistribution des cibles, sélection des ETF et comparaisons historiques sur dates communes. |
| `app/src/allocation/geography.js` | Classement des pays en zones et exemples de pays affichés dans l’assistant. |
| `app/src/portfolio/storage.js` | Validation, migration et sauvegarde du brouillon et des paniers locaux. |
| `app/src/portfolio/PortfolioLibrary.jsx` et `workspace.css` | Bibliothèque de paniers et panneaux catalogue/panier à défilements distincts. |
| `app/src/migration/MigrationPlanner.jsx` et `migration.css` | Saisie du portefeuille réel, cible mémorisée, plan d’achats et enregistrement des opérations. |
| `app/src/migration/engine.js` et `engine.test.js` | Achats sans vente, apport minimum, parts entières, validation du stockage séparé et tests. |
| `app/src/data/mvp-profiles.json` | 51 profils analysables : ISIN, pays, secteurs, date et URL du reporting Amundi. |
| `audit_amundi_compositions.py` et `COMPOSITIONS.md` | Audit des reportings et méthode de validation des répartitions. |
| `app/src/data/mvp-prices.json` | VL ajustées mensuelles en EUR des 54 ETF, source, méthode et date d'extraction. |
| `app/src/etf_pea_fortuneo_amundi.json` | Copie **utilisée par l'application** du catalogue PEA et des frais. |
| `etf_pea_fortuneo_amundi.json` | Catalogue source à la racine ; garder sa copie dans `app/src/` synchronisée si elle change. |
| `fetch_mvp_prices.py` | Commande de mise à jour conservée pour les usages existants ; appelle `fetch_amundi_prices.py`. |
| `fetch_amundi_prices.py` | Récupère les VL ajustées Amundi, convertit la part USD avec les taux BCE et valide les 54 séries avant écriture. |
| `.github/workflows/pages.yml` et `app/vite.config.js` | Construction et publication GitHub Pages ; chemin de base du site. |

`fetch_etf_history.py`, `etf_returns.json` et `retroviseur-portefeuille.jsx` sont des artefacts antérieurs. L'application actuelle ne les importe pas. Les fichiers d'exemple Vite encore présents dans `app/src/` ne sont pas non plus utilisés par l'écran principal.

## Calculs à préserver

- Les poids des ETF sélectionnés vont de 0 à 100 %. Un ETF à 0 % reste sélectionné jusqu'au clic sur « Retirer ». Un poids verrouillé ne change pas quand on modifie les autres. Le solde non alloué a un rendement nul et aucune exposition.
- Le rendement utilise la plus récente séquence **continue** de mois communs aux ETF de poids positif. Le sélecteur 1 an / 3 ans / 5 ans / Max ne peut pas dépasser cette séquence ; les dates affichées donnent la période effective. Les poids cibles sont rétablis chaque mois dans la simulation. Les courbes ETF sélectionnées à 0 % peuvent être affichées sans raccourcir cette période.
- Le repère MSCI World est calculé avec la série `LU1681043599` sur les **mêmes dates** que le portefeuille. Il reste affiché quand les courbes ETF sont masquées. La performance de référence dans l'en-tête suit le sélecteur commun.
- Les expositions actuelles sont les poids des ETF ventilés selon la **dernière composition publiée** de chaque indice, pour les 51 profils vérifiés. Le poids des trois autres ETF apparaît sous « Composition indisponible » ; aucune exposition n'est inventée. Les zones regroupent les pays ; BRICS est une vue transversale déjà comprise dans les zones.
- La « contribution estimée » est exprimée en **points de rendement du portefeuille**, pas en rendement propre au pays ou au secteur. La contribution de chaque ETF est calculée mois par mois avec la valeur du portefeuille avant le mois, son poids cible et son rendement du mois. Elle est ensuite ventilée entre pays et secteurs selon la dernière composition publiée, supposée constante sur toute la période. Les contributions retrouvent le rendement total seulement si tous les ETF de poids positif ont une composition vérifiée. L'attribution reste indicative faute de compositions historiques.
- Les VL ajustées reflètent déjà les frais courants inclus dans la valeur de l'ETF ; les frais annuels affichés sont descriptifs et ne sont pas soustraits une seconde fois. Le courtage, la fiscalité, l'inflation et les mouvements de trésorerie ne sont pas simulés.

## Données et mises à jour

Le catalogue vient de la page Fortuneo indiquée dans son champ `source`. Les profils géographiques et sectoriels ont chacun une date et un lien vers le reporting Amundi. Les séries de rendement viennent de la **VL ajustée Amundi**, qui prend en compte les distributions ; elles sont stockées localement, **pas diffusées en direct**. La part `LU1681042948`, libellée en USD, est convertie en EUR avec le taux de référence quotidien de la BCE. Une VL ne représente pas le prix exact auquel un particulier achète ou vend l'ETF en bourse.

Pour actualiser les historiques, exécuter `python3 fetch_mvp_prices.py` à la racine, examiner le diff de `app/src/data/mvp-prices.json`, puis relancer la vérification. Cette commande appelle `fetch_amundi_prices.py`, qui interroge par lots le point d'accès des fiches produit Amundi et l'[API des taux BCE](https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata). Elle vérifie ISIN, devise et présence d'au moins deux mois pour chaque ETF, exclut le mois courant et refuse de remplacer le fichier si une série manque. Le point d'accès Amundi est interne au site et **n'est pas une API publique documentée** : vérifier son fonctionnement à chaque actualisation. Une mise à jour mensuelle suffit à la granularité de l'interface.

Pour ajouter ou actualiser une composition analysable, suivre `COMPOSITIONS.md`, vérifier l'ISIN dans le catalogue, puis ajouter un profil sourcé et daté dans `mvp-profiles.json`. Une nouvelle composition nécessite de mettre à jour sa date et son URL. Pour ajouter un ETF au catalogue, synchroniser les deux copies du JSON et vérifier que le script Amundi lui fournit un historique ; sans historique, la sélection reste possible mais le rendement est indisponible. Garder visibles les limites de la simulation si la méthode de calcul évolue.

## Prochaines pistes

Surveiller les trois ETF encore sans composition et la stabilité du point d'accès Amundi, compléter les tests des calculs historiques et envisager un export/import des paniers locaux. Un **véritable rendement historique par pays ou secteur** demanderait des séries historiques des constituants ou des indices dédiés, avec une méthode explicite de pondération et de reconstitution ; il ne peut pas être déduit de la seule composition actuelle des ETF.

## Constructeur d’allocation (septembre 2026)

`app/src/allocation/AllocationWizard.jsx` porte le parcours modal en trois étapes ; `engine.js` sépare les calculs purs de l’interface et `geography.js` partage la classification géographique avec le tableau de bord. `allocation.css` gère l’affichage ordinateur et mobile. La méthode, les limites et la sauvegarde locale sont détaillées dans `app/README.md`.

Avant publication, exécuter également `npm test` dans `app/`, puis vérifier construction → réglages → contrepoids/remplacement → application → annulation, et l’enregistrement/rechargement d’un modèle personnel. Les cibles d’exposition restent approchées, contrairement aux poids d’ETF verrouillés et aux contraintes de budget/lignes. Les verrous de zones figent les cibles pendant la redistribution et le mélange de conviction ; ils ne sont pas des contraintes exactes sur la composition obtenue. Les variantes doivent conserver des libellés correspondant à une amélioration réelle. Les comparaisons de risque utilisent toujours des dates communes et ne doivent pas traverser un trou d’historique.


## Espace local et panneaux de composition

`app/src/portfolio/storage.js` valide et migre le stockage versionné ; `PortfolioLibrary.jsx` gère les paniers nommés et `workspace.css` sépare catalogue, panier et analyse. Les instantanés conservent le brouillon du constructeur ; `AllocationWizard` reçoit la bibliothèque et remonte son état au portefeuille, sans second stockage concurrent. Le nom de chaque ETF vient du catalogue officiel, après fusion avec les profils.

Vérifier : ajout avec panier visible, restauration après rechargement (zéros, verrous, courbes, Max, filtres, convictions), chargement/mise à jour d’un panier, suppression/annulation, migration des modèles et bascule Catalogue/Panier sur mobile. Les tests de stockage font partie de `npm test`.

`app/src/allocation/AllocationComparison.jsx` partage le tableau de comparaison entre le constructeur et Mes paniers. `comparePerformance` et `compareRisk` utilisent la même extraction de mois communs continus. Vérifier aussi : verrou de zone puis autre curseur/conviction, sauvegarde via le nom facultatif près d’Appliquer, rechargement des verrous, comparaison de paniers avec une part récente et changement de période, défilement du tableau sur mobile.

Points de non-régression pour l’assistant :

- Un verrou de zone porte sur la cible **au sein des actions**. Modifier la part actions change donc son poids cible dans le portefeuille total. Verrouiller une zone à 0 % doit aussi fonctionner ; la dernière zone libre doit conserver le solde disponible.
- Appliquer puis rouvrir l’assistant doit conserver les objectifs et les verrous de zones. Charger un panier restaure les poids enregistrés ; sélectionner ce panier comme point de départ dans l’assistant recalcule les propositions avec ses réglages.
- Un nom vide ne crée pas de panier. Un nom renseigné enregistre une copie avant l’application ; un échec de stockage ou la limite de 30 paniers laisse le dialogue ouvert et le portefeuille inchangé. La bibliothèque doit sélectionner le panier nouvellement enregistré.
- Ajouter ou retirer une allocation de la comparaison peut changer les dates communes et tous les rendements affichés. Un ETF de poids nul ne raccourcit pas la période. Une absence d’historique doit produire une indisponibilité, jamais un rendement inventé.
- Sur mobile, vérifier la fermeture du dialogue, le champ de nom et le bouton d’application, ainsi que le défilement du tableau jusqu’aux dernières colonnes et aux secteurs. Le document ne doit pas déborder horizontalement.

## Migration vers le portefeuille réel

`app/src/migration/MigrationPlanner.jsx` fournit le dialogue accessible depuis le bouton Atteindre cette allocation. `engine.js` isole la projection des achats sans vente, les arrondis, l’apport minimum, l’enregistrement des opérations et le stockage versionné séparé (`champ-libre.migration.v1`). `engine.test.js` couvre le scénario 90 € Monde / cible 90–5–5, les budgets insuffisants, les liquidités, les positions exclues, les parts entières, les frais, la conservation des centimes, les sauvegardes invalides et une comparaison exhaustive de petits budgets.

Vérifier : saisie du portefeuille réel → choix du panier courant ou enregistré → mémorisation de la cible → versement → comparaison avant/après → prix datés et parts entières → enregistrement réel corrigé → annulation → rechargement. La cible ne suit pas les modifications ultérieures du simulateur. La saisie des prix, des valorisations et des opérations reste manuelle. La méthode d’arrondi par enveloppe ne garantit pas l’optimum entier global ; le reliquat reste liquide.

## Portrait et analyse d’allocation

`app/src/portfolio/portrait.js` contient les mesures, les rôles par défaut et les textes déterministes. `PortfolioPortrait.jsx` et `portrait.css` présentent la barre de structure, cinq jauges accessibles et l’analyse au clic, partagées entre le tableau de bord et `AllocationComparison`. Les rôles personnalisés sont validés dans `storage.js` sous `snapshot.portraitRoles` ; les sauvegardes antérieures restent compatibles. Le constructeur transmet les rôles de la source choisie à ses propositions, à la sauvegarde et à l’application ; Annuler restaure les rôles précédents.

`compareRisk(portfolios, period = 60)` accepte désormais une période explicite et renvoie aussi le délai de récupération du pire recul, ou `null` si le sommet n’a pas été retrouvé. Les appels existants sans période conservent leur fenêtre de 60 mois. Les jauges et les performances du comparatif utilisent les mêmes dates communes continues. La méthode et les limites des cinq repères figurent dans l’interface et dans le README.

Vérification avant publication : `npm test`, lint et build ; cliquer les cinq indicateurs, personnaliser un rôle puis recharger/enregistrer un panier, comparer les rôles distincts d’allocations identiques, changer de période, examiner une composition manquante ou une part récente, vérifier le constructeur et l’affichage mobile.
