#!/usr/bin/env bash
# Build du site hastria.fun : compile Tailwind v3 puis assemble index.html,
# et régénère stats.json depuis le dépôt du projet.
# Prérequis : node. tailwindcss : binaire local (TAILWIND=...) sinon npx.
set -euo pipefail
cd "$(dirname "$0")/.."

TW="${TAILWIND:-/home/pecorio/projects/opencode-omega/desktop/node_modules/.bin/tailwindcss}"
if [ ! -x "$TW" ]; then
  echo "build: tailwindcss introuvable. Définissez TAILWIND=/chemin/vers/tailwindcss (ou « npx tailwindcss@3.4.17 »)."
  exit 1
fi

"$TW" -c tailwind.config.js -i scripts/tailwind.input.css -o assets/tailwind.css --minify
node scripts/embed.mjs
node scripts/build-stats.mjs
echo "build ok — index.html ($(wc -c < index.html | tr -d ' ') octets)"
