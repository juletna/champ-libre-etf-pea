# Répartitions géographiques et sectorielles

## Ce que mesure l'application

Les fichiers de prix ne contiennent que des valeurs liquidatives. Les champs `pays` et `secteurs` de `app/src/data/mvp-profiles.json` proviennent des graphiques **de l'indice de référence** dans les reportings mensuels Amundi. Pour un ETF à réplication synthétique, ils décrivent l'exposition à l'indice, pas le panier de titres physiquement détenu. La vue « Zones » regroupe les pays de ces graphiques.

Chaque profil conserve l'ISIN, la date du reporting et son URL. Ce sont des instantanés : l'application utilise cette même répartition pour estimer les contributions sur toute la période historique sélectionnée. Elle ne reconstitue pas les compositions passées.

## Audit du 26 septembre 2026

Le catalogue compte 54 ETF. Les 7 profils préexistants ont été conservés et 44 autres ajoutés après examen des reportings Amundi, soit **51 compositions disponibles**. Pour les 44 nouveaux profils, les PDF contiennent l'ISIN attendu et sont datés du 31 août 2026. Les poids extraits totalisent environ 100 % par pays et par secteur (écart maximal observé : 0,15 point, dû aux valeurs publiées ou aux arrondis). Les noms de pays et de secteurs sont harmonisés avec ceux de l'application. Le graphique de l'ETF CAC 40 ESG, qui juxtapose son indice et un indice parent, a été contrôlé visuellement : seules les barres de son propre indice ont été reprises.

| ISIN | Situation constatée | Suite |
| --- | --- | --- |
| `FR0013346681` | Le [reporting PEA Euro Court Terme](https://www.amundietf.fr/pdfDocuments/monthly-factsheet/FR0013346681/FRA/FRA/RETAIL/ETF) présente des ventilations par maturité et notation, sans les tableaux pays/secteurs d'un indice d'actions. | Garder « Composition indisponible » pour ces vues ; ne pas inventer un secteur « Finance » ou une exposition « Zone euro ». |
| `FR0014017NX3` | Le chemin du reporting mensuel Amundi renvoyait 404, avec les profils `RETAIL` et `INSTITUTIONNEL`, y compris pour les dates récentes testées. | Réessayer lors du prochain audit ou consulter la fiche produit Amundi. |
| `FR001400S9V0` | Même erreur 404 pour le reporting mensuel. Un rapport périodique existe, mais il ne constitue pas le tableau daté de l'indice attendu par l'application. | Chercher un reporting de l'indice avant d'ajouter un profil. |

## Refaire le contrôle

Depuis la racine du dépôt, avec `pdftotext` de Poppler installé :

```bash
python3 audit_amundi_compositions.py
python3 audit_amundi_compositions.py --all
```

La première commande audite les ETF encore sans profil ; la seconde recontrôle tout le catalogue. Le résultat détaillé est écrit dans `/tmp/etf-composition-audit.json`. Le script essaie les reportings `RETAIL` et `INSTITUTIONNEL` par ISIN, vérifie que le PDF cite cet ISIN, relève sa date, puis extrait les tableaux pays et secteurs. Il marque « à vérifier » les graphiques dont le nombre de valeurs et de libellés ne correspond pas ou dont le total s'écarte de 100 %.

Avant de copier une répartition dans `mvp-profiles.json` :

1. Ouvrir le PDF indiqué par `reporting_url` et vérifier visuellement l'ordre des barres, les éventuelles catégories à 0 % et la présence d'un « indice parent » distinct.
2. Utiliser les poids de **l'indice**, pas ceux d'un panier de titres détenus ni d'un indice parent. Garder « Autres pays » lorsque le reporting le publie avec un poids positif.
3. Harmoniser les libellés : par exemple `Taiwan` → `Taïwan`, `Corée` → `Corée du Sud`, `Technologies de l'info.` → `Technologie`, `Conso non Cyclique` → `Consommation défensive`.
4. Vérifier les totaux, l'ISIN, la date, l'URL et le rendu des vues Pays, Zones et Secteurs. Les poids de l'ETF doivent rester entièrement ventilés ; l'application normalise les petits écarts d'arrondi.

Le script n'écrit volontairement pas dans `mvp-profiles.json` : les graphiques PDF avec deux séries ou des libellés sans valeur demandent un contrôle visuel avant publication.
