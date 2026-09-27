# Champ libre — portefeuille ETF PEA

Outil de simulation d'un portefeuille d'ETF éligibles au PEA et de planification des achats pour rejoindre une allocation cible avec son portefeuille réel.

**[Simulateur public existant](https://juletna.github.io/champ-libre-etf-pea/)** — les écrans Patrimoine, PEA et budget exigent le serveur local ; le site public ne les affiche pas.

## Application locale Patrimoine + ETF

Après `cd app && npm ci && npm run build`, revenir à la racine puis lancer `./run-local.sh` sur macOS/Linux, `run-local.command` sur macOS, ou `run-local.cmd` sous Windows. Python 3.9+ et une interface compilée sont requis ; Node sert uniquement à compiler les sources. Le serveur n’écoute que `127.0.0.1:8765` et ouvre la page locale. `--data-dir CHEMIN` choisit un autre répertoire de données, `--port N` un autre port. L’emplacement par défaut dépend de l’OS et s’affiche au lancement.

Le serveur et `run-local.sh` ont été vérifiés sur macOS. Les lanceurs Windows et Linux sont fournis, mais leur exécution sur ces OS reste à vérifier. Après une nouvelle situation patrimoniale, vérifiez et, si nécessaire, réduisez le versement ponctuel déclaré : il n’est pas abaissé silencieusement lorsque la liquidité mobilisable diminue.

La navigation locale réunit Vue d’ensemble, Mon cap, Mon PEA, Prochain investissement et le constructeur ETF. Importez les CSV de Patrimoine après aperçu dans une base vierge ; les originaux restent à leur emplacement. L’import PEA prend un tableau CSV ou collé, demande les colonnes, les espèces et le mode complet ou partiel ; confirmez le rapprochement avec l’ancien poste PEA pour éviter un doublon. Le budget ponctuel est limité aux liquidités explicitement choisies, après réserves. La cible est une copie versionnée d’un panier ; la simulation d’achats ne modifie pas le relevé réel.

Dans la barre supérieure, **Exporter les données de ce navigateur** crée un JSON des anciennes clés sur l’origine actuellement ouverte. Pour reprendre des données du site public ou d’un ancien `localhost`, exportez depuis **ce navigateur et cette origine**, puis importez ce fichier dans l’application locale. L’import ne vide jamais le stockage source et crée une copie SQLite de sécurité de l’état local précédent. **Sauvegarde SQLite** exporte une copie cohérente de toutes les données ; **Restaurer SQLite** vérifie l’intégrité, la version et le schéma avant remplacement, en gardant aussi une copie préalable. **Export JSON** est un export versionné et lisible de toutes les tables pour portabilité/inspection ; la restauration se fait avec SQLite. Copiez vous-même les sauvegardes sur un disque externe ou Drive : elles contiennent des données personnelles **en clair**. Aucun compte cloud ni synchronisation ne sont intégrés.

Le format exact d’un export Fortuneo devra être ajusté à partir d’un exemple anonymisé ; l’import tabulaire générique est disponible. Les frais du prochain investissement sont configurables et les prix sont saisis avec leur date. Vérifiez l’éligibilité de chaque ISIN et votre tarif avant tout ordre. Aucun ordre n’est transmis.

Le code source et les données mensuelles sont conservés dans ce dépôt public. Les 54 ETF PEA Amundi du catalogue ont un historique de valeur liquidative ajustée ; 51 ont aussi une composition par pays et secteur relevée dans leur reporting Amundi. Chaque mise à jour de `main` reconstruit et publie automatiquement le site avec GitHub Pages.

Le bouton **Atteindre cette allocation** permet de saisir les valeurs de son portefeuille réel, de mémoriser un panier cible et de répartir ses prochains versements sans vendre. Le plan compare les allocations avant/après et propose un mode en parts entières avec prix et frais saisis manuellement. Les données restent dans le navigateur ; aucun ordre n’est transmis. Voir [le parcours et ses limites](app/README.md#planifier-les-prochains-achats).

La méthode de contrôle et les trois ETF encore sans composition sont décrits dans [COMPOSITIONS.md](COMPOSITIONS.md).

Pour lancer l'application localement :

```bash
cd app
npm ci
npm run dev
```

Voir [la documentation de l'application](app/README.md) pour les fonctions et les sources de données, et le [guide de reprise du projet](PROJECT.md) pour son architecture, ses calculs, ses limites et les vérifications à faire avant publication.
