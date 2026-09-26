# Champ libre — prototype portefeuille ETF PEA

Tableau de bord local pour composer un portefeuille virtuel et visualiser ses expositions géographiques et sectorielles, ainsi que son rendement historique mensuel.

**[Ouvrir l'outil en ligne](https://juletna.github.io/champ-libre-etf-pea/)**

Sur grand écran, la liste des ETF défile dans le panneau de gauche : les graphiques à droite restent en place pendant le réglage des poids.

Chaque position peut être verrouillée : les autres curseurs ne modifient alors pas son poids. Si aucun ETF libre ne peut recevoir un solde, celui-ci apparaît comme « Non alloué » ; il n'a ni exposition géographique ou sectorielle ni rendement dans la simulation.

L'œil de chaque ETF affiche ou masque sa courbe ; le bouton du graphique agit sur toutes les courbes ETF, tandis que le portefeuille et le repère MSCI World restent visibles. Le sélecteur commun 1 an / 3 ans / 5 ans / Max pilote le graphique, la performance de l'en-tête et les contributions estimées des cartes pays, zones et secteurs.

## Lancer

```bash
cd app
npm ci
npm run dev
```

Ouvrir l'adresse locale indiquée par Vite (habituellement `http://localhost:5173`).

## Couverture du prototype

Sept ETF de la liste Fortuneo Amundi sont analysables : MSCI World (`LU1681043599`), PEA S&P 500 (`FR0011871128`), PEA Nasdaq-100 (`FR0011871110`), Euro Stoxx Banks (`LU1829219390`), MSCI Europe (`FR0013412038`), Japon TOPIX (`FR0013411980`) et marchés émergents (`FR0013412020`). Le catalogue source compte 54 ETF éligibles PEA ; les 47 autres n'ont pas encore de profils d'exposition et d'historique vérifiés pour ce tableau de bord.

- **Expositions** : pays et secteurs des indices, relevés dans les reportings mensuels Amundi. La vue géographique regroupe notamment les États-Unis, la zone euro, l'Europe hors zone euro, le Japon, l'Asie de l'Est hors Japon et l'Asie du Sud et du Sud-Est. Le poids des BRICS identifiés est un indicateur transversal : il est déjà inclus dans ces zones et ne s'ajoute pas à leur total. Les « autres pays » des reportings restent dans une catégorie non détaillée et sont exclus du calcul BRICS. Le pays attribué à une société ne mesure ni la localisation de ses ventes ni exactement son risque de change. Chaque profil garde la date et l'URL de son reporting. Ce sont des instantanés : la composition historique du portefeuille n'est pas reconstituée.
- **Rendements** : clôtures mensuelles ajustées de Yahoo Finance, alignées par mois et par ISIN. Le mois en cours est exclu. La simulation part de 100 et revient aux poids cibles à chaque fin de mois. Les frais de l'ETF sont déjà reflétés dans son cours historique ; le courtage et les impôts ne sont pas simulés.
- **Frais affichés** : moyenne pondérée des frais annuels de gestion et d'administration figurant dans les DIC Amundi. C'est un indicateur descriptif ; il n'est pas déduit une deuxième fois des rendements.
- **Contributions estimées** : le rendement simulé est attribué aux ETF mois par mois, puis ventilé selon leur dernière composition publiée, supposée constante sur la période. Les valeurs affichées sont des points de rendement du portefeuille ; elles ne sont pas des rendements historiques propres aux pays ou secteurs. Les compositions historiques ne sont pas disponibles dans ce prototype.

La couche historique est une source de démonstration, pas un flux de cotations en temps réel. Les dates sont visibles dans l'interface.

## Rafraîchir les cours

Depuis la racine du projet :

```bash
python3 fetch_mvp_prices.py
```

Le script vérifie les noms des tickers Amundi avant d'écrire `app/src/data/mvp-prices.json`. Les expositions de `app/src/data/mvp-profiles.json` doivent être mises à jour séparément à partir de nouveaux reportings.

Voir aussi le [guide de reprise](../PROJECT.md) pour la structure du dépôt, la méthode de calcul et la vérification avant publication.
