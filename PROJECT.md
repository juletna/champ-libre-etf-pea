# Champ libre — guide de reprise du projet

Ce document décrit l'état du dépôt pour toute personne ou tout outil qui reprend le travail. Il complète les README et ne dépend d'aucun assistant particulier.

## Objectif et périmètre

L'application permet de composer un portefeuille **virtuel** d'ETF PEA de l'offre Fortuneo Amundi, puis d'observer son rendement mensuel simulé et ses expositions par pays, zone et secteur. Elle sert à explorer des allocations, sans passer d'ordre. Le prototype analyse 7 ETF sur les 54 du catalogue relevé le 26 septembre 2026.

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
| `app/src/data/mvp-prices.json` | Historiques de clôtures mensuelles ajustées et date d'extraction. |
| `app/src/etf_pea_fortuneo_amundi.json` | Copie **utilisée par l'application** du catalogue PEA et des frais. |
| `etf_pea_fortuneo_amundi.json` | Catalogue source à la racine ; garder sa copie dans `app/src/` synchronisée si elle change. |
| `fetch_mvp_prices.py` | Actualise les cours du MVP depuis Yahoo Finance Chart API. |
| `.github/workflows/pages.yml` et `app/vite.config.js` | Construction et publication GitHub Pages ; chemin de base du site. |

`fetch_etf_history.py`, `etf_returns.json` et `retroviseur-portefeuille.jsx` sont des artefacts antérieurs. L'application actuelle ne les importe pas. Les fichiers d'exemple Vite encore présents dans `app/src/` ne sont pas non plus utilisés par l'écran principal.

## Calculs à préserver

- Les poids des ETF sélectionnés vont de 0 à 100 %. Un ETF à 0 % reste sélectionné jusqu'au clic sur « Retirer ». Un poids verrouillé ne change pas quand on modifie les autres. Le solde non alloué a un rendement nul et aucune exposition.
- Le rendement utilise les mois communs aux ETF de poids positif. Le sélecteur 1 an / 3 ans / 5 ans / Max ne peut pas dépasser l'historique réellement commun ; les dates affichées donnent la période effective. Les poids cibles sont rétablis chaque mois dans la simulation. Les courbes ETF sélectionnées à 0 % peuvent être affichées sans raccourcir cette période.
- Le repère MSCI World est calculé avec la série `LU1681043599` sur les **mêmes dates** que le portefeuille. Il reste affiché quand les courbes ETF sont masquées. La performance de référence dans l'en-tête suit le sélecteur commun.
- Les expositions actuelles sont les poids des ETF ventilés selon la **dernière composition publiée** de chaque indice. Les zones regroupent les pays ; BRICS est une vue transversale déjà comprise dans les zones.
- La « contribution estimée » est exprimée en **points de rendement du portefeuille**, pas en rendement propre au pays ou au secteur. La contribution de chaque ETF est calculée mois par mois avec la valeur du portefeuille avant le mois, son poids cible et son rendement du mois. Elle est ensuite ventilée entre pays et secteurs selon la dernière composition publiée, supposée constante sur toute la période. Les contributions des catégories exhaustives retrouvent le rendement total du portefeuille, à l'arrondi près. Cette attribution par pays/secteur reste indicative faute de compositions historiques.
- Les cours ajustés reflètent déjà les frais courants inclus dans la valeur de l'ETF ; les frais annuels affichés sont descriptifs et ne sont pas soustraits une seconde fois. Le courtage, la fiscalité, l'inflation et les mouvements de trésorerie ne sont pas simulés.

## Données et mises à jour

Le catalogue vient de la page Fortuneo indiquée dans son champ `source`. Les profils géographiques et sectoriels ont chacun une date et un lien vers le reporting Amundi. Les cours du MVP proviennent de Yahoo Finance et sont des données de démonstration, **pas un flux en direct**.

Pour actualiser les cours, exécuter `python3 fetch_mvp_prices.py` à la racine, examiner le diff de `app/src/data/mvp-prices.json`, puis relancer la vérification. Le script vérifie le nom Amundi des tickers et exclut le mois courant. Ne pas automatiser une actualisation quotidienne sans besoin : l'interface travaille sur des clôtures mensuelles.

Pour ajouter un ETF analysable, vérifier d'abord son éligibilité dans le catalogue, puis ajouter un profil sourcé et daté dans `mvp-profiles.json` et un historique mensuel dans `mvp-prices.json`. Vérifier l'ISIN, le ticker, les frais et les répartitions ; le simple ajout au catalogue ne suffit pas à l'afficher dans le simulateur. Une nouvelle composition nécessite de mettre à jour sa date et son URL. Garder visibles les limites de la simulation si la méthode de calcul évolue.

## Prochaines pistes

Étendre progressivement la couverture au-delà des 7 ETF, fiabiliser les sources de cours et de compositions, ajouter des tests sur les calculs et envisager l'enregistrement local de portefeuilles. Un **véritable rendement historique par pays ou secteur** demanderait des séries historiques des constituants ou des indices dédiés, avec une méthode explicite de pondération et de reconstitution ; il ne peut pas être déduit de la seule composition actuelle des ETF.
