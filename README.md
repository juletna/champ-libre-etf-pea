# Champ libre — portefeuille ETF PEA

Outil de simulation d'un portefeuille d'ETF éligibles au PEA et de planification des achats pour rejoindre une allocation cible avec son portefeuille réel.

**[Site public](https://juletna.github.io/champ-libre-etf-pea/)** — exploration ETF temporaire, sans enregistrement. Les données personnelles, paniers et achats exigent l’application locale SQLite. Le site publié ne reflétera ce changement qu’après un déploiement.

## Application locale Patrimoine + ETF

Après `cd app && npm ci && npm run build`, revenir à la racine puis double-cliquer sur `Champ libre.command` dans le dossier du projet sur macOS. Il est possible d’en créer un alias Finder sur le Bureau. En terminal, utiliser `./run-local.sh` sur macOS/Linux, ou `run-local.cmd` sous Windows. Python 3.9+ et une interface compilée sont requis ; Node sert uniquement à compiler les sources. Le serveur n’écoute que `127.0.0.1:8765` et ouvre la page locale. `--data-dir CHEMIN` choisit un autre répertoire de données, `--port N` un autre port. L’emplacement par défaut dépend de l’OS et s’affiche au lancement.

Le serveur et `run-local.sh` ont été vérifiés sur macOS. Les lanceurs Windows et Linux sont fournis, mais leur exécution sur ces OS reste à vérifier. Après une nouvelle situation patrimoniale, vérifiez et, si nécessaire, réduisez le versement ponctuel déclaré : il n’est pas abaissé silencieusement lorsque la liquidité mobilisable diminue.

La navigation locale réunit Vue d’ensemble, Mon cap, Mon PEA, Prochain investissement et le constructeur ETF. Dans Vue d’ensemble, les postes se modifient directement dans un tableau pleine largeur : ajouter une ligne, renseigner ses cellules, ouvrir **Champs** pour l’échéancier, le statut, l’usage, l’actif détenu ou l’enveloppe, puis cliquer sur **Enregistrer**. Sur petit écran, chaque poste devient une fiche. Toutes les lignes modifiées sont validées dans une seule transaction. L’import PEA prend un tableau CSV ou collé, demande les colonnes, les espèces et le mode complet ou partiel ; un tableau Fortuneo copié avec ses en-têtes dispose d’une prévisualisation dédiée en mode partiel, qui conserve les espèces et les positions absentes. Si le PEA figure déjà dans les postes patrimoniaux, rapprochez-le avec ce poste pour éviter un doublon. Le budget ponctuel est limité aux liquidités explicitement choisies, après réserves. La cible est une copie versionnée d’un panier ; la simulation d’achats ne modifie pas le relevé réel.

La Vue d’ensemble affiche la courbe du patrimoine net aux dates connues, la répartition des actifs actuels par catégorie et la ventilation par propriété. Chaque case de propriété montre ses actifs par catégorie, son montant net et ses dettes éventuelles ; enfants et prévisionnel restent à part. Les crédits liés ouvrent leur échéancier complet (capital, remboursement, intérêts, assurance, échéance et solde) à la date sélectionnée. Les échéances passées sont supposées payées et le reliquat final est conservé.

Dans la barre supérieure, **Sauvegarde SQLite** exporte une copie cohérente de toutes les données ; **Restaurer SQLite** vérifie l’intégrité, la version et le schéma avant remplacement et conserve une copie préalable. Copiez la sauvegarde sur un support indépendant : elle contient des données personnelles en clair. Le site public ne conserve aucun brouillon ni panier ; le navigateur et SQLite ne sont pas synchronisés.

Dans **Mon PEA**, ouvrez l’export Fortuneo dans un tableur, copiez le tableau avec ses en-têtes et collez-le dans **Coller le tableau**. Cliquez sur **Importer un tableau Fortuneo** : l’application reconnaît ISIN, libellé, quantité et valorisation, arrondit les valorisations au centime et affiche une prévisualisation. Cet export ne donne pas les espèces ; le relevé est donc préparé comme mise à jour partielle, qui conserve les espèces et les positions absentes. Vérifiez les lignes avant **Confirmer ce relevé**. Le fichier `.xls` n’est pas accepté directement par le sélecteur CSV. Les frais du prochain investissement sont configurables et les prix sont saisis avec leur date. Vérifiez l’éligibilité de chaque ISIN et votre tarif avant tout ordre. Aucun ordre n’est transmis.

Le code source et les données mensuelles sont conservés dans ce dépôt public. Les 54 ETF PEA Amundi du catalogue ont un historique de valeur liquidative ajustée ; 51 ont aussi une composition par pays et secteur relevée dans leur reporting Amundi. Chaque mise à jour de `main` reconstruit et publie automatiquement le site avec GitHub Pages.

Dans l’application locale, **Atteindre cette allocation** ouvre le plan d’achats fondé sur le PEA et le budget enregistrés dans SQLite. Aucun ordre n’est transmis.

La méthode de contrôle et les trois ETF encore sans composition sont décrits dans [COMPOSITIONS.md](COMPOSITIONS.md).

Pour développer le simulateur statique sans serveur de données :

```bash
cd app
npm ci
npm run dev
```

Voir [la documentation de l'application](app/README.md) pour les fonctions et les sources de données, et le [guide de reprise du projet](PROJECT.md) pour son architecture, ses calculs, ses limites et les vérifications à faire avant publication.
