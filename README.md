# Champ libre — portefeuille ETF PEA

Outil de simulation d'un portefeuille virtuel d'ETF éligibles au PEA.

**[Ouvrir l'outil en ligne](https://juletna.github.io/champ-libre-etf-pea/)**

Le code source et les données mensuelles sont conservés dans ce dépôt public. Les 54 ETF PEA Amundi du catalogue ont un historique de valeur liquidative ajustée ; 51 ont aussi une composition par pays et secteur relevée dans leur reporting Amundi. Chaque mise à jour de `main` reconstruit et publie automatiquement le site avec GitHub Pages.

La méthode de contrôle et les trois ETF encore sans composition sont décrits dans [COMPOSITIONS.md](COMPOSITIONS.md).

Pour lancer l'application localement :

```bash
cd app
npm ci
npm run dev
```

Voir [la documentation de l'application](app/README.md) pour les fonctions et les sources de données, et le [guide de reprise du projet](PROJECT.md) pour son architecture, ses calculs, ses limites et les vérifications à faire avant publication.
