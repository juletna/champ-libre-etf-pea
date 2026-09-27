# Champ libre — prototype portefeuille ETF PEA

Tableau de bord local pour composer un portefeuille virtuel, visualiser ses expositions géographiques et sectorielles et son rendement historique mensuel, puis planifier les achats permettant de rapprocher son portefeuille réel d’une allocation cible.

**[Ouvrir l'outil en ligne](https://juletna.github.io/champ-libre-etf-pea/)**

Le catalogue et le panier disposent de deux panneaux et de défilements indépendants. Sur grand écran, l’analyse occupe une troisième colonne ; sur écran intermédiaire, elle passe sous les deux panneaux. Sur mobile, les boutons Catalogue / Mon panier restent accessibles pendant le défilement. La recherche porte sur le nom, la catégorie et l’ISIN ; les filtres couvrent catégorie, distribution, encours minimum, frais maximum et présence d’un historique complet sur la période. Le classement peut suivre la performance, l’encours, les frais ou le nom. Les ETF déjà ajoutés disparaissent des résultats et restent dans « Vos ETF ».

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

## Constructeur d’allocation

Le bouton **Construire une allocation** ouvre un parcours en trois étapes : point de départ (portefeuille, modèle ou allocation libre), convictions et équilibre, puis propositions. Le portefeuille n’est modifié qu’à l’application. Une action permet de restaurer les poids, la sélection, les verrous et les courbes précédents. Le bouton **Ajuster mon allocation** revient aux réglages après une première application.

- Le curseur de conviction mélange les objectifs de zones/secteurs avec les expositions du repère MSCI World. Les objectifs personnalisés sont exprimés au sein des actions ; les tableaux de résultat montrent les expositions dans le portefeuille total. Monter un objectif redistribue proportionnellement les dimensions libres. Un verrou de zone fixe sa cible dans la poche actions, y compris face au curseur de conviction ; il ne garantit pas une exposition exacte des ETF obtenus. Les verrous et les cibles sont sauvegardés. Des exemples de pays explicitent chaque zone, notamment les deux groupes asiatiques.
- Le curseur défensif/dynamique répartit le portefeuille entre actions et le fonds PEA Euro Court Terme. Ce fonds est une poche distincte, sans exposition actions inventée ni garantie de capital.
- La recherche utilise les 51 compositions vérifiées et le fonds court terme, respecte les verrous, le maximum de lignes et les filtres de frais/encours/distribution/couverture explicite. Les positions verrouillées sont prioritaires sur les filtres. Les contraintes incompatibles bloquent l’application avec un message. L’absence de mention de couverture ne prouve pas l’absence de couverture.
- Le moteur minimise les écarts quadratiques aux cibles avec une pénalité de frais, par transferts déterministes jusqu’au dixième de point. Il s’agit d’une recherche approchée, sans garantie d’optimum global. Les propositions « moins de frais » et « moins d’ETF » apparaissent seulement quand elles apportent effectivement cette différence. L’encours départage les candidats équivalents ; les rendements ne pilotent pas la sélection.
- Les vases communicants rapprochent les baisses et les hausses de poids, y compris le solde auparavant non alloué. **Trouver un contrepoids** teste des transferts de 10 points au plus qui réduisent l’exposition dominante d’un ETF, sans dépasser les contraintes de lignes ou modifier les verrous. Il ne s’agit pas d’une couverture garantie. **Remplacer** transfère le poids, le verrouille sur l’ETF choisi et recalcule le reste.
- La volatilité annualisée et la baisse maximale sont calculées sur les mêmes mois continus communs aux portefeuilles comparés, sur 60 mois au plus. Au moins 12 rendements mensuels sont nécessaires ; moins de 36 mois déclenche une mention d’historique court. La baisse maximale ne mesure que les valeurs de fin de mois. Les poids sont rétablis chaque mois ; le solde non alloué a un rendement nul. Les frais déjà intégrés aux VL ne sont pas soustraits de nouveau.
- Le tableau **Comparer les allocations**, dans les propositions et dans **Mes paniers**, confronte jusqu’à quatre allocations : zones, secteurs, frais et performance totale simulée. La période 1 an / 3 ans / 5 ans / Max est partagée avec le tableau de bord. Toutes les colonnes utilisent la même séquence continue de mois communs aux positions de poids positif ; une période raccourcie ou indisponible est signalée. La performance est cumulée, avec rééquilibrage mensuel et solde non alloué à rendement nul. Les expositions affichées sont actuelles, pas historiques.
- À côté du bouton d’application, un **nom de configuration facultatif** transforme l’action en **Enregistrer et appliquer**. Une copie nommée rejoint la bibliothèque ; sans nom, seul le portefeuille courant est appliqué. Si l’enregistrement échoue, le dialogue reste ouvert et le portefeuille ne change pas.
- Les modèles personnels sont intégrés à Mes paniers, avec les poids et la configuration du constructeur. Les anciens modèles sont importés à la première ouverture du nouvel espace local. Ils restent réutilisables comme points de départ dans le constructeur.

Les calculs du constructeur disposent de tests dédiés : `npm test` depuis `app/`.

### Comprendre les verrous et les comparaisons

Les deux types de verrous ont des effets distincts : un **verrou d’ETF** fixe son poids dans le portefeuille, tandis qu’un **verrou de zone** fixe un objectif dans la poche actions. Par exemple, une cible Japon verrouillée à 20 % avec 60 % d’actions correspond à une cible de 12 % du portefeuille total. Les zones libres absorbent les redistributions ; le tableau « Souhaité et obtenu » permet de constater les écarts restant dans la combinaison d’ETF retenue.

Les exemples de pays décrivent le classement utilisé par l’application : **Asie de l’Est hors Japon** regroupe Chine, Taïwan, Corée du Sud et Hong Kong ; **Asie du Sud et du Sud-Est** regroupe Inde, Singapour, Indonésie, Malaisie et Thaïlande. Le Japon a sa propre zone. Ces indications ne décrivent pas les pays effectivement détenus par chaque panier : leur présence et leur poids dépendent des ETF choisis.

Dans le comparateur, les lignes de zones et secteurs montrent les expositions obtenues et la première ligne indique la performance totale cumulée. Ajouter une allocation récente peut raccourcir l’historique de **toutes** les colonnes. La durée demandée est partagée avec le tableau de bord, mais les dates effectives peuvent différer : le tableau de bord utilise le portefeuille courant, le comparateur utilise l’ensemble des allocations cochées. Toujours lire les dates affichées avant de rapprocher les chiffres.


## Paniers et configurations locales

Le brouillon courant est automatiquement sauvegardé sous `champ-libre.workspace.v1` dans `localStorage`. Un rechargement restaure les ETF (y compris à 0 %), les poids, les verrous, les courbes, la période, la vue géographique, les filtres et le brouillon du constructeur (objectifs, critères, étape et proposition). Celui-ci conserve aussi le portefeuille qui servait de référence pour reconnaître une modification manuelle ultérieure.

**Mes paniers** permet d’enregistrer jusqu’à 30 configurations nommées, les charger sans recalcul des poids, mettre à jour ou renommer le panier chargé, et supprimer une entrée avec annulation. Les modifications du brouillon ne changent pas les copies nommées. Les enregistrements du constructeur rejoignent la même bibliothèque. Les anciens modèles de `champ-libre.allocation-models.v1` sont importés sans effacer cette clé.

Les données sont validées au chargement : identifiants obsolètes écartés, poids invalides ou supérieurs à 100 % rejetés, réglages inconnus remplacés par leurs valeurs par défaut. Un échec d’accès ou de quota est signalé sans interrompre le travail en mémoire. Les données sont propres au navigateur et à l’origine : aperçu local et site publié ont des espaces distincts ; effacer les données du navigateur efface les paniers.

Tous les ETF utilisent le **nom officiel du catalogue Fortuneo**, jusque dans le constructeur, les légendes et les sources. Les libellés explicatifs restent des métadonnées (indice, catégorie). La recherche accepte aussi les anciens noms courts. Un ETF ajouté est mis en évidence et révélé dans le panneau du panier, sans déplacer le catalogue.

Sur grand écran, le catalogue et le panier disposent de panneaux et de défilements distincts, pour ajouter un ETF puis régler son poids sans aller et venir dans la page. Sur mobile, les onglets **Catalogue** et **Mon panier** permettent de basculer entre les deux. Dans l’assistant, les actions restent accessibles au bas du dialogue ; le tableau de comparaison défile horizontalement pour montrer les autres allocations.

## Planifier les prochains achats

**Atteindre cette allocation**, sous Mes paniers, ouvre le portefeuille réel : saisie des valeurs actuelles par ETF et des liquidités, choix du panier simulé ou d’un panier enregistré comme cible, puis saisie du prochain versement. La cible est copiée explicitement et reste indépendante des modifications du simulateur. Les poids non alloués deviennent une cible de liquidités ; un fonds court terme reste une position ETF.

Par exemple, avec 90 € de Monde, une cible de 90 % Monde / 5 % banques / 5 % ressources et un versement de 10 €, le plan théorique propose 5 € de banques et 5 € de ressources. Le portefeuille atteint alors 100 € répartis selon la cible.

Le plan sans vente compare les valeurs et poids avant/après. Le moteur répartit les liquidités et le versement en minimisant la somme des écarts au carré à la cible, puis distribue les centimes restants. Il affiche également l’apport minimum théorique à valorisations constantes, hors frais et arrondis. Une position détenue absente de la cible empêche de l’atteindre exactement par des apports seuls.

Le mode **Parts entières** utilise uniquement des prix en euros datés saisis par l’utilisateur, et des frais fixes par achat. Chaque enveloppe théorique est arrondie à la part inférieure après frais ; le reliquat reste en liquidités. Cette méthode prudente ne recherche pas l’optimum entier global et ne réaffecte pas les reliquats. Les historiques mensuels ne sont pas utilisés comme prix d’exécution.

**Enregistrer mes achats réalisés** ouvre un formulaire pour corriger les montants, le versement et les frais effectivement réalisés. Un dépassement du disponible bloque l’enregistrement. Les montants achetés hors frais augmentent les valorisations saisies, le reliquat devient le solde en liquidités et le versement prévu revient à zéro. Une annulation est disponible jusqu’à la prochaine modification. Il faut réactualiser les valeurs de marché manuellement ; aucun ordre n’est envoyé.

Le portefeuille réel, la cible et les paramètres sont conservés séparément sous `champ-libre.migration.v1`. Les données illisibles ou incompatibles restent intactes et désactivent l’écriture automatique ; les erreurs de stockage sont signalées. Aucun compte courtier ni cours en direct n’est connecté. Les tests du moteur et du stockage de migration font partie de `npm test`.

## Portrait visuel du portefeuille

Le portefeuille courant et les deux comparatifs (bibliothèque et constructeur) partagent cinq jauges cliquables : diversité géographique, diversité sectorielle, place des convictions, écart au MSCI World et résistance historique. Une barre répartit les poids entre socle, complément émergents, convictions, fonds court terme et non alloué. Le texte explicatif est produit localement à partir des mêmes chiffres ; il ne recommande pas de portefeuille gagnant.

- Géographie : poids du premier pays parmi les pays détaillés ; la jauge montre son complément à 100 %. « Autres pays » est exclu et la couverture est affichée. Minimum : 80 % de la poche actions détaillés.
- Secteurs : poids des trois premiers secteurs dans la poche actions ; la jauge montre le reste.
- Convictions : poids total des ETF classés en conviction. Les rôles initiaux sont documentés et modifiables ; ils sont conservés dans le brouillon et chaque panier, puis repris lors d’une application/annulation du constructeur. Ce classement est distinct du curseur d’objectifs du constructeur.
- Écart au World : moyenne des distances de variation totale des distributions de zones et de secteurs (moitié de la somme des écarts absolus en points), de 0 à 100. Les zones non détaillées sont exclues et les distributions restantes normalisées ; 80 % de couverture minimum des deux côtés. Ce n’est ni une mesure par titres individuels ni une prévision.
- Résistance : recul maximal sommet-creux sur les fins de mois de la période sélectionnée, accompagné de la volatilité annualisée et du temps de récupération de cet épisode, du sommet au retour à son niveau. Douze rendements mensuels continus minimum. Un sommet non retrouvé reste signalé. En comparaison, les dates sont communes à toutes les allocations et identiques à celles des performances.

Une position actions sans composition vérifiée rend les indicateurs de géographie, secteurs et écart indisponibles ; le fonds court terme et le non alloué ne créent pas artificiellement de diversité actions. Les compositions arrondies sont normalisées. Les calculs et la persistance des rôles sont couverts par `src/portfolio/portrait.test.js` dans `npm test`.
