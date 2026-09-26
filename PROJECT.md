# Champ libre — guide de reprise du projet

Ce document décrit l'état du dépôt pour toute personne ou tout outil qui reprend le travail. Il complète les README et ne dépend d'aucun assistant particulier.

## Objectif et périmètre

L'application permet de composer un portefeuille **virtuel** d'ETF PEA de l'offre Fortuneo Amundi, puis d'observer son rendement mensuel simulé et ses expositions par pays, zone et secteur. Elle sert à explorer des allocations, sans passer d'ordre. Les 54 ETF du catalogue relevé le 26 septembre 2026 sont sélectionnables et disposent d'un historique mensuel ; 7 ont aussi une composition vérifiée.

Site publié : <https://juletna.github.io/champ-libre-etf-pea/>. Un push sur `main` déclenche le workflow GitHub Pages dans `.github/workflows/pages.yml`.

## Démarrer et vérifier

À la racine du dépôt :

```bash
cd app
npm ci
npm run dev
```

Vite affiche l'adresse locale ; le chemin configuré est `/champ-libre-etf-pea/`. Avant de publier :

```bash
cd app
npm run lint
npm run build
```

Il n'y a pas encore de suite de tests automatisés. Vérifier dans le navigateur le choix de période, l'ajout et le retrait d'ETF, un poids à 0 %, les verrouillages, les yeux des courbes, le bouton global et les vues Pays/Zones. Contrôler que le rendement, sa période et les contributions des cartes changent ensemble.

## Carte du dépôt

| Fichier | Rôle |
| --- | --- |
| `app/src/PortfolioMvp.jsx` | État du portefeuille, calculs et interface React. |
| `app/src/portfolio-mvp.css` | Styles du tableau de bord. |
| `app/src/data/mvp-profiles.json` | 7 profils analysables : ISIN, ticker, pays, secteurs, date et URL du reporting Amundi. |
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
- Les expositions actuelles sont les poids des ETF ventilés selon la **dernière composition publiée** de chaque indice, pour les 7 profils vérifiés. Le poids des autres ETF apparaît sous « Composition indisponible » ; aucune exposition n'est inventée. Les zones regroupent les pays ; BRICS est une vue transversale déjà comprise dans les zones.
- La « contribution estimée » est exprimée en **points de rendement du portefeuille**, pas en rendement propre au pays ou au secteur. La contribution de chaque ETF est calculée mois par mois avec la valeur du portefeuille avant le mois, son poids cible et son rendement du mois. Elle est ensuite ventilée entre pays et secteurs selon la dernière composition publiée, supposée constante sur toute la période. Les contributions retrouvent le rendement total seulement si tous les ETF de poids positif ont une composition vérifiée. L'attribution reste indicative faute de compositions historiques.
- Les VL ajustées reflètent déjà les frais courants inclus dans la valeur de l'ETF ; les frais annuels affichés sont descriptifs et ne sont pas soustraits une seconde fois. Le courtage, la fiscalité, l'inflation et les mouvements de trésorerie ne sont pas simulés.

## Données et mises à jour

Le catalogue vient de la page Fortuneo indiquée dans son champ `source`. Les profils géographiques et sectoriels ont chacun une date et un lien vers le reporting Amundi. Les séries de rendement viennent de la **VL ajustée Amundi**, qui prend en compte les distributions ; elles sont stockées localement, **pas diffusées en direct**. La part `LU1681042948`, libellée en USD, est convertie en EUR avec le taux de référence quotidien de la BCE. Une VL ne représente pas le prix exact auquel un particulier achète ou vend l'ETF en bourse.

Pour actualiser les historiques, exécuter `python3 fetch_mvp_prices.py` à la racine, examiner le diff de `app/src/data/mvp-prices.json`, puis relancer la vérification. Cette commande appelle `fetch_amundi_prices.py`, qui interroge par lots le point d'accès des fiches produit Amundi et l'[API des taux BCE](https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata). Elle vérifie ISIN, devise et présence d'au moins deux mois pour chaque ETF, exclut le mois courant et refuse de remplacer le fichier si une série manque. Le point d'accès Amundi est interne au site et **n'est pas une API publique documentée** : vérifier son fonctionnement à chaque actualisation. Une mise à jour mensuelle suffit à la granularité de l'interface.

Pour ajouter une composition analysable, vérifier d'abord l'ISIN dans le catalogue, puis ajouter un profil sourcé et daté dans `mvp-profiles.json`. Une nouvelle composition nécessite de mettre à jour sa date et son URL. Pour ajouter un ETF au catalogue, synchroniser les deux copies du JSON et vérifier que le script Amundi lui fournit un historique ; sans historique, la sélection reste possible mais le rendement est indisponible. Garder visibles les limites de la simulation si la méthode de calcul évolue.

## Prochaines pistes

Étendre progressivement les compositions au-delà des 7 ETF, surveiller la stabilité du point d'accès Amundi, ajouter des tests sur les calculs et envisager l'enregistrement local de portefeuilles. Un **véritable rendement historique par pays ou secteur** demanderait des séries historiques des constituants ou des indices dédiés, avec une méthode explicite de pondération et de reconstitution ; il ne peut pas être déduit de la seule composition actuelle des ETF.
