// API publique de hastria.fun — servie par le serveur lui-même sous /v1.
//
// Objectif : « tout vient du serveur ». Cette API expose l'unique source de
// vérité du site : le fichier stats.json (instantané réel du projet, régénéré
// par scripts/build-stats.mjs). Aucune donnée simulée, aucun état en mémoire.
//
// Elle écoute uniquement en boucle locale (127.0.0.1:8790) : nginx publie /v1
// vers cette adresse. stats.json est relu à CHAQUE requête, donc une mise à
// jour du fichier est visible immédiatement, sans redémarrer le service.
//
// Lancement : bun run /opt/hastria-site-api/server.ts  (voir hastria-site-api.service)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATS_PATH = join(HERE, "stats.json");

const HOST = "127.0.0.1";
const PORT = 8790;

// `head` : une requête HEAD porte les mêmes en-têtes mais aucun corps.
function json(body: string, status: number, head = false): Response {
  return new Response(head ? null : body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=15",
    },
  });
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const head = req.method === "HEAD";
    const read = req.method === "GET" || head;

    if (read && path === "/v1/health") {
      return json(JSON.stringify({ ok: true }), 200, head);
    }

    if (read && path === "/v1/stats") {
      // Relecture systématique : source unique, jamais mise en cache en mémoire.
      try {
        const body = readFileSync(STATS_PATH, "utf8");
        return json(body, 200, head);
      } catch {
        return json(JSON.stringify({ error: "stats_unavailable" }), 503, head);
      }
    }

    return json(JSON.stringify({ error: "not_found" }), 404, head);
  },
});

console.log(`hastria-site-api à l'écoute sur http://${server.hostname}:${server.port}`);
