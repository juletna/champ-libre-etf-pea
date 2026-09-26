# Champ libre — prototype portefeuille ETF PEA

Tableau de bord local pour composer un portefeuille virtuel et visualiser ses expositions géographiques et sectorielles, ainsi que son rendement historique mensuel.

**[Ouvrir l'outil en ligne](https://juletna.github.io/champ-libre-etf-pea/)**

Sur grand écran, la sidebar ETF défile indépendamment du tableau de bord. La recherche porte sur le nom, la catégorie et l’ISIN ; les filtres couvrent catégorie, distribution, encours minimum, frais maximum et présence d’un historique complet sur la période. Le classement peut suivre la performance, l’encours, les frais ou le nom. Les ETF déjà ajoutés disparaissent des résultats et restent dans « Vos ETF ».

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

Les 54 ETF PEA Amundi du catalogue Fortuneo sont sélectionnables et disposent d'un historique mensuel de VL ajustée. 51 ont aussi une composition par pays et secteur relevée dans un reporting Amundi daté. Les trois autres sont le PEA Euro Court Terme (`FR0013346681`), dont le reporting ne publie pas ces répartitions, et deux ETF dont le reporting mensuel n'était pas accessible lors de l'audit : PEA Global MSCI ACWI (`FR0014017NX3`) et PEA Luxe Monde (`FR001400S9V0`). Leur part du portefeuille reste sous « Composition indisponible ». La méthode et les sources figurent dans [`COMPOSITIONS.md`](../COMPOSITIONS.md).

- **Expositions** : pays et secteurs des indices, relevés dans les reportings mensuels Amundi. La vue géographique regroupe notamment les États-Unis, la zone euro, l'Europe hors zone euro, le Japon, l'Asie de l'Est hors Japon et l'Asie du Sud et du Sud-Est. Le poids des BRICS identifiés est un indicateur transversal : il est déjà inclus dans ces zones et ne s'ajoute pas à leur total. Les « autres pays » des reportings restent dans une catégorie non détaillée et sont exclus du calcul BRICS. Le pays attribué à une société ne mesure ni la localisation de ses ventes ni exactement son risque de change. Chaque profil garde la date et l'URL de son reporting. Ce sont des instantanés : la composition historique du portefeuille n'est pas reconstituée.
- **Rendements** : dernière VL ajustée Amundi disponible de chaque mois terminé, alignée par ISIN. La série commence à la première VL officielle de la part ; la série ajustée prend en compte les distributions. La part en USD est convertie en EUR avec le taux de référence quotidien de la BCE du jour de la VL ou du dernier jour ouvré précédent. Les mois incomplets sont exclus. La simulation part de 100, ne traverse pas un trou dans les mois communs et revient aux poids cibles chaque mois. Les frais courants sont déjà reflétés dans la VL ; le courtage et les impôts ne sont pas simulés.
- **Frais affichés** : moyenne pondérée des frais annuels de gestion et d'administration figurant dans les DIC Amundi. C'est un indicateur descriptif ; il n'est pas déduit une deuxième fois des rendements.
- **Encours** : taille du fonds en euros fournie par Amundi, toutes classes de parts confondues. Deux parts d'un même fonds peuvent donc afficher le même encours. L'instantané et sa date sont dans `app/src/data/mvp-fund-sizes.json` ; le classement n'utilise pas un flux en temps réel.
- **Contributions estimées** : le rendement simulé est attribué aux ETF mois par mois, puis ventilé selon leur dernière composition publiée, supposée constante sur la période. Les valeurs affichées sont des points de rendement du portefeuille ; elles ne sont pas des rendements historiques propres aux pays ou secteurs. Les compositions historiques ne sont pas disponibles dans ce prototype.

Ces historiques sont un instantané des données Amundi, pas un flux en temps réel ni un prix d'exécution en bourse. Les dates sont visibles dans l'interface. Une part récente peut limiter la période commune de la simulation.

## Rafraîchir les historiques

Depuis la racine du projet :

```bash
python3 fetch_mvp_prices.py
python3 fetch_amundi_fund_sizes.py
```

La première commande appelle `fetch_amundi_prices.py`. Le script récupère les VL ajustées par lots depuis le point d'accès utilisé par les fiches produit Amundi, contrôle les ISIN, la devise et la présence d'au moins deux mois, puis écrit `app/src/data/mvp-prices.json` seulement si les 54 séries sont exploitables. La conversion USD/EUR utilise l'[API de la BCE](https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata). Le point d'accès Amundi n'est pas une API publique documentée : sa structure peut changer. Relire le journal de récupération, le diff et le graphique après chaque mise à jour.

La seconde commande met à jour l'encours des 54 fonds dans `app/src/data/mvp-fund-sizes.json` depuis le même point d'accès Amundi. Elle vérifie les ISIN et la présence des valeurs avant d'écrire le fichier.

Les expositions de `app/src/data/mvp-profiles.json` doivent être mises à jour séparément à partir de nouveaux reportings. La liste PEA et les frais viennent du [catalogue Fortuneo Amundi](https://www.fortuneo.fr/bourse/freetrade-amundi/etf) et des DIC Amundi.

Voir aussi le [guide de reprise](../PROJECT.md) pour la structure du dépôt, la méthode de calcul et la vérification avant publication.
