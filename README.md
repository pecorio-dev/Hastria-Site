# hastria-site — la vitrine hastria.fun

Site public du système multi-modèles **omega** (projet [Hastria](https://github.com/pecorio-dev/Hastria)).
Sur le domaine principal, sans sous-domaine. Remplace l'ancienne page de `hastria.fun`.

## Règle fondatrice : aucune donnée simulée

- Les **statistiques** sont lues depuis la source publique du projet : `stats.json`
  (régénéré depuis le dépôt par `scripts/build-stats.mjs` : journal d'autonomie,
  bench, tests, coûts) ou `GET /v1/stats` quand l'API est en ligne sur le même domaine.
- Le **code source** affiché dans la page « Code » est lu en direct depuis GitHub
  (`api.github.com` + `raw.githubusercontent.com`) — jamais recopié à la main.
- Quand une valeur manque, le site affiche « — » ou un état vide explicite.
  Il n'y a **aucun compteur fictif, aucun faux avis, aucune connexion simulée**.

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | **L'artefact** : page auto-contenue (CSS compilé inline, JS inline). |
| `app.js` | Source du moteur JS (associée aux marqueurs `APP:START/END` de index.html). |
| `stats.json` | Snapshot réel des mesures du projet (généré). |
| `scripts/build-stats.mjs` | Génère `stats.json` depuis le dépôt omega (lecture seule). |
| `scripts/build.sh` | Compile Tailwind v3, assemble `index.html`, régénère `stats.json`. |
| `scripts/embed.mjs` | Inline le CSS (marqueurs `TW:START/END`) et le JS (`APP:START/END`). |
| `assets/og.png` | Image Open Graph 1200×630. `assets/favicon.svg` : favicon. |
| `robots.txt`, `sitemap.xml` | Indexation. |
| `reference/` | Zip Design Arena d'origine et copie de référence (archive). |

## Build

```bash
bash scripts/build.sh          # ou : TAILWIND=/chemin/vers/tailwindcss bash scripts/build.sh
```

Le binaire Tailwind utilisé par défaut est celui du dépôt omega
(`../opencode-omega/desktop/node_modules/.bin/tailwindcss`, v3.4.17).
`OMEGA_ROOT` permet de pointer `build-stats.mjs` vers un autre clone du dépôt.

## Déploiement (nginx)

Copier à la racine du domaine : `index.html`, `stats.json`, `robots.txt`,
`sitemap.xml`, `assets/og.png`, `assets/favicon.svg`. Aucune dépendance runtime,
aucun service requis : le site est 100 % statique.

## Comptes (ouverture par étapes)

Deux méthodes prévues, et seulement deux : **Google** et **e-mail grand public vérifié**,
via le Supabase GoTrue déjà en place sur le serveur (`/api/auth/v1`). Le jour du lancement,
renseigner dans `app.js` (bloc `CFG`) : `accountsOpen: true` et `supabaseAnonKey`
(clé publique). Tant que ces valeurs sont fermées, le site l'explique et ne simule rien.
