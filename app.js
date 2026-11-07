/* Hastria — vitrine publique.
   Règle : aucune donnée simulée. Les statistiques viennent de la source publique du
   projet (stats.json régénéré depuis le dépôt, ou GET /v1/stats quand l'API est en
   ligne) ; le code source est lu depuis GitHub ; rien n'est inventé, jamais. */

// ---------- CONFIGURATION (surchargeable via window.HASTRIA_CONFIG) ----------
var CFG = Object.assign({
  apiBase: "/v1",                 // API du serveur, même origine
  authBase: "/api/auth/v1",       // Supabase GoTrue déjà en place sur le serveur
  supabaseAnonKey: "",            // clé publique, renseignée quand les comptes ouvrent
  accountsOpen: false,            // passe à true le jour du lancement des comptes
  repo: "https://github.com/pecorio-dev/Hastria",
  repoApi: "https://api.github.com/repos/pecorio-dev/Hastria",
  repoRaw: "https://raw.githubusercontent.com/pecorio-dev/Hastria/main"
}, window.HASTRIA_CONFIG || {});

var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
var fmt = function (n) { return n == null ? "—" : new Intl.NumberFormat("fr-FR").format(n); };
var fmtUsd = function (n) { return n == null ? "—" : n.toFixed(4).replace(".", ",") + " $"; };
var dateFr = function (iso) { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return "—"; } };

var stats = null;

// ---------- NAVIGATION SPA ----------
var PAGE_TITLES = {
  accueil: "Hastria — le système multi-modèles omega",
  projet: "Projet de A à Z — Hastria",
  dashboard: "Stats publiques — Hastria",
  code: "Code source — Hastria",
  plugins: "Plugins et branchement — Hastria",
  store: "Store de modules — Hastria",
  builder: "Builder Pro — Hastria",
  contributeurs: "Contribuer — Hastria",
  compte: "Comptes — Hastria",
  createur: "Console créateur — Hastria",
  docs: "Docs API — Hastria",
  legal: "Informations légales — Hastria"
};

function showPage(id) {
  var page = $("page-" + id); if (!page) return;
  var prev = document.querySelector(".page.active");
  if (prev) prev.classList.remove("active");
  page.classList.add("active");
  document.querySelectorAll("[data-nav]").forEach(function (n) {
    var on = n.getAttribute("data-nav") === id;
    n.classList.toggle("active", on);
    if (on) { n.setAttribute("aria-current", "page"); } else { n.removeAttribute("aria-current"); }
  });
  $("mobileMenu").classList.add("hidden");
  if (location.hash !== "#" + id) { try { history.replaceState(null, "", "#" + id); } catch (e) { location.hash = id; } }
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  if (PAGE_TITLES[id]) document.title = PAGE_TITLES[id];
  if (id === "code") ensureTree();
}
function toggleMobile() { $("mobileMenu").classList.toggle("hidden"); }
window.addEventListener("hashchange", function () {
  var h = location.hash.replace("#", "");
  if (h && $("page-" + h)) showPage(h);
});

// ---------- TOAST ET MODALES ----------
var toastTimer = null;
function toast(msg) {
  var t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add("hidden"); }, 4600);
}
function openModal(el) {
  el.classList.remove("hidden");
  var f = el.querySelector("button, input, a");
  if (f) f.focus({ preventScroll: true });
}
function closeModal(el) { el.classList.add("hidden"); }
function openAuth(msg) {
  if (msg) $("authMsg").textContent = msg;
  $("authEmailForm").hidden = true;
  openModal($("authModal"));
}
function closeAuth() { closeModal($("authModal")); }
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { closeAuth(); closePlugin(); }
});
function requireAuth(action) {
  openAuth(action + " — l'action ouvrira avec les comptes approuvés. Aucune connexion simulée sur ce site : l'aperçu, l'export et la lecture restent libres.");
}

// ---------- AUTHENTIFICATION (Google + e-mail uniquement, réelle quand ouverte) ----------
function authNote(msg) { $("authMsg").textContent = msg; }
function startGoogle() {
  if (CFG.accountsOpen && CFG.supabaseAnonKey) {
    location.href = CFG.authBase + "/authorize?provider=google&apikey=" + encodeURIComponent(CFG.supabaseAnonKey) +
      "&redirect_to=" + encodeURIComponent(location.origin + location.pathname);
    return;
  }
  authNote("La connexion Google ouvrira avec le lancement des comptes — aucune connexion simulée sur ce site.");
}
function startEmail() {
  if (CFG.accountsOpen && CFG.supabaseAnonKey) { $("authEmailForm").hidden = false; $("authEmail").focus(); }
  else authNote("La connexion par e-mail ouvrira avec le lancement des comptes — aucune connexion simulée sur ce site.");
}
function startEmailBack() { $("authEmailForm").hidden = true; }
function sendMagicLink(e) {
  e.preventDefault();
  if (!CFG.accountsOpen || !CFG.supabaseAnonKey) { authNote("La connexion par e-mail ouvrira avec le lancement des comptes."); return; }
  var email = $("authEmail").value.trim();
  fetch(CFG.authBase + "/magiclink", {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": CFG.supabaseAnonKey },
    body: JSON.stringify({ email: email, create_user: true })
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    authNote("Lien envoyé à " + email + " — vérifiez votre boîte de réception. Le lien est à usage unique.");
  }).catch(function (err) {
    authNote("L'envoi n'a pas abouti (" + err.message + "). Réessayez plus tard.");
  });
}

// ---------- STATISTIQUES ----------
function fetchJSON(url, ms) {
  var c = new AbortController();
  var t = setTimeout(function () { c.abort(); }, ms || 9000);
  return fetch(url, { signal: c.signal, cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).finally(function () { clearTimeout(t); });
}
function loadStats(bust) {
  var q = bust ? ("?t=" + Date.now()) : "";
  var urls = [CFG.apiBase + "/stats" + q, "stats.json" + q];
  var tryNext = function (i) {
    if (i >= urls.length) { statsUnavailable(); return Promise.resolve(false); }
    return fetchJSON(urls[i], 9000).then(function (s) {
      if (s && s.schema === 1) { applyStats(s); return true; }
      throw new Error("schéma inattendu");
    }).catch(function () { return tryNext(i + 1); });
  };
  return tryNext(0);
}
function refreshAPI(manual) {
  loadStats(true).then(function (ok) {
    if (manual) toast(ok ? "Statistiques rechargées depuis la source publique." : "Source indisponible pour le moment — réessayez plus tard.");
  });
}

function applyStats(s) {
  stats = s;
  var p = s.project || {}, t = s.tests || {}, b = s.bench || {}, cost = s.cost || {}, aut = s.autonomy || {};
  var combos = b.combos || [];
  var synced = s.generated_at ? dateFr(s.generated_at) : "—";

  if ($("heroStatusChip")) $("heroStatusChip").textContent = "● SOURCE PUBLIQUE — SYNCHRO " + synced;
  if ($("heroApiBadge")) { $("heroApiBadge").textContent = "SNAPSHOT PUBLIC"; }
  if ($("heroIt")) $("heroIt").textContent = fmt(p.iterations);
  if ($("heroTests")) $("heroTests").textContent = fmt(t.count);
  if ($("heroBench")) $("heroBench").textContent = fmt(combos.length);
  if ($("heroSpend")) $("heroSpend").textContent = cost.loop_usd == null ? "—" : cost.loop_usd.toFixed(2).replace(".", ",") + " $";
  if ($("heroSync")) $("heroSync").textContent = "dernière synchronisation : " + synced;
  if ($("topLatency")) $("topLatency").textContent = "snapshot du " + synced;
  if ($("topDot")) $("topDot").className = "w-2 h-2 bg-emerald-500 rounded-full";

  var cards = [
    ["ITÉRATIONS D'AUTONOMIE", fmt(p.iterations), "boucle d'auto-amélioration, branche " + (s.repo && s.repo.branch ? s.repo.branch : "—"), ""],
    ["TESTS", fmt(t.count), (t.files ? fmt(t.files) + " fichiers" : "—") + " • " + (t.assertions ? fmt(t.assertions) + " assertions" : "—") + " • " + (t.fail == null ? "—" : fmt(t.fail) + " échec"), "text-[#00E8B8]"],
    ["COMBOS DE BENCH", fmt(combos.length), fmt(b.tasks) + " tâches cachées • classement public", ""],
    ["BOUCLE D'AUTONOMIE", cost.loop_usd == null ? "—" : (cost.loop_usd.toFixed(4).replace(".", ",") + " $"), "plafond " + fmt(cost.loop_cap_usd) + " $ • snapshot du " + synced, "text-emerald-300"]
  ];
  var cardsHtml = cards.map(function (c) {
    return '<article class="card p-5"><p class="font-mono text-[10px] tracking-[.16em] text-white/45">' + c[0] + '</p><p class="font-display font-bold text-[30px] leading-none mt-2.5 ' + c[3] + '">' + c[1] + '</p><p class="text-xs text-white/50 mt-2">' + c[2] + '</p></article>';
  }).join("");
  if ($("apiCards")) $("apiCards").innerHTML = cardsHtml;
  if ($("dashCards")) $("dashCards").innerHTML = cardsHtml;
  if ($("apiStatus")) $("apiStatus").textContent = "source : " + (s.source || "dépôt public") + " — synchronisé le " + synced;
  if ($("dashBadge")) $("dashBadge").textContent = "SNAPSHOT PUBLIC";
  if ($("statsSource")) $("statsSource").textContent = "source : " + (s.source || "dépôt public") + " — synchronisé le " + synced;

  if ($("chartSpend")) $("chartSpend").innerHTML = spendSVG(aut.history, cost.loop_cap_usd);
  if ($("chartTotal")) {
    var last = aut.history && aut.history.length ? aut.history[aut.history.length - 1].usd : null;
    $("chartTotal").textContent = last == null ? "—" : fmtUsd(last) + " cumulés — " + fmt(aut.history.length) + " points";
  }
  if ($("chartModels")) $("chartModels").innerHTML = benchBars(combos);
  renderModels("");
  renderRepoFacts();
}
function statsUnavailable() {
  stats = null;
  var unavailable = '<div class="state-empty">Source de statistiques indisponible pour le moment.<br>Ce site n\'affiche jamais de chiffres inventés — revenez un peu plus tard ou consultez le <a class="underline text-white" href="' + CFG.repo + '" target="_blank" rel="noopener">dépôt public</a>.</div>';
  if ($("heroStatusChip")) $("heroStatusChip").textContent = "● SOURCE PUBLIQUE — INDISPONIBLE";
  if ($("heroApiBadge")) $("heroApiBadge").textContent = "INDISPONIBLE";
  if ($("heroSync")) $("heroSync").textContent = "aucune valeur affichée tant que la source n'est pas joignable";
  if ($("topLatency")) $("topLatency").textContent = "source indisponible";
  if ($("topDot")) $("topDot").className = "w-2 h-2 bg-amber-400 rounded-full";
  if ($("apiCards")) $("apiCards").innerHTML = unavailable;
  if ($("dashCards")) $("dashCards").innerHTML = unavailable;
  if ($("apiStatus")) $("apiStatus").textContent = "source : indisponible";
  if ($("dashBadge")) $("dashBadge").textContent = "INDISPONIBLE";
  if ($("statsSource")) $("statsSource").textContent = "source : indisponible";
  if ($("chartSpend")) $("chartSpend").innerHTML = unavailable;
  if ($("chartModels")) $("chartModels").innerHTML = unavailable;
  if ($("chartTotal")) $("chartTotal").textContent = "—";
  renderModels("");
  renderRepoFacts();
}

function spendSVG(history, cap) {
  if (!history || history.length < 2) return '<div class="state-empty h-full grid place-items-center">Historique indisponible.<br>Il s\'affichera dès la prochaine synchronisation.</div>';
  var W = 720, H = 240, P = 30;
  var minX = history[0].iteration, maxX = history[history.length - 1].iteration;
  var maxY = Math.max(1, cap || 0);
  history.forEach(function (h) { if (h.usd > maxY) maxY = h.usd; });
  maxY = maxY * 1.08;
  var X = function (v) { return P + (v - minX) / Math.max(1, maxX - minX) * (W - 2 * P); };
  var Y = function (v) { return H - P - (v / maxY) * (H - 2 * P); };
  var d = history.map(function (h, i) { return (i ? "L" : "M") + X(h.iteration).toFixed(1) + " " + Y(h.usd).toFixed(1); }).join(" ");
  var capLine = cap ? '<line x1="' + P + '" y1="' + Y(cap).toFixed(1) + '" x2="' + (W - P) + '" y2="' + Y(cap).toFixed(1) + '" stroke="#FFB340" stroke-dasharray="5 6" stroke-width="1" opacity=".7"/><text x="' + (W - P) + '" y="' + (Y(cap) - 7).toFixed(1) + '" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="11" fill="#FFB340" opacity=".85">plafond ' + fmt(cap) + ' $</text>' : "";
  var last = history[history.length - 1];
  return '<svg viewBox="0 0 ' + W + " " + H + '" class="w-full h-full" role="img" aria-label="Dépense cumulée de la boucle d\'autonomie : ' + fmtUsd(last.usd) + ' à l\'itération ' + last.iteration + '">' +
    capLine +
    '<path d="' + d + '" fill="none" stroke="#7C6CFF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<text x="' + P + '" y="18" font-family="JetBrains Mono,monospace" font-size="11" fill="rgba(255,255,255,.6)">' + fmtUsd(last.usd) + " cumulés</text>" +
    '<text x="' + P + '" y="' + (H - 8) + '" font-family="JetBrains Mono,monospace" font-size="11" fill="rgba(255,255,255,.45)">it. ' + minX + "</text>" +
    '<text x="' + (W - P) + '" y="' + (H - 8) + '" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="11" fill="rgba(255,255,255,.45)">it. ' + maxX + "</text>" +
    "</svg>";
}
function benchBars(combos) {
  if (!combos.length) return '<div class="state-empty">Aucun résultat de bench publié.</div>';
  return combos.map(function (c) {
    var color = c.rate >= 94 ? "#34d399" : c.rate >= 75 ? "#fbbf24" : "#fb7185";
    return '<div><div class="flex justify-between text-[12px] font-mono text-white/60 mb-1"><span class="text-white/85">' + esc(c.combo) + "</span><span>" + c.ok + "/" + c.total + " — " + fmt(c.rate) + " %</span></div>" +
      '<div class="progress"><i style="width:' + Math.max(2, Math.min(100, c.rate)) + "%;background:" + color + '"></i></div>' +
      '<p class="text-[11px] text-white/40 font-mono mt-1">' + fmt(c.cost) + " $ · " + fmt(c.sec) + " s</p></div>";
  }).join("");
}
function renderModels(filter) {
  var tb = $("modelsTable"); if (!tb) return;
  var combos = stats && stats.bench && stats.bench.combos ? stats.bench.combos : [];
  var q = (filter || "").toLowerCase();
  var list = combos.filter(function (c) { return c.combo.toLowerCase().indexOf(q) !== -1; });
  tb.innerHTML = list.length ? list.map(function (c) {
    var color = c.rate >= 94 ? "text-emerald-300" : c.rate >= 75 ? "text-amber-300" : "text-rose-300";
    return '<tr class="border-b border-white/5 hover:bg-white/[0.03]"><td class="p-4 font-mono text-[13px] font-bold">' + esc(c.combo) + '</td><td class="font-mono text-[13px]">' + c.ok + "/" + c.total + '</td><td class="font-bold ' + color + '">' + fmt(c.rate) + ' %</td><td class="font-mono text-[13px]">' + fmt(c.cost) + ' $</td><td class="font-mono text-[13px]">' + fmt(c.sec) + ' s</td></tr>';
  }).join("") : '<tr><td class="p-6 text-white/45 text-sm" colspan="5">Aucun combo à afficher pour le moment.</td></tr>';
}
function filterModels(v) { renderModels(v); }

function renderRepoFacts() {
  var el = $("repoFacts"); if (!el) return;
  var span = function (inner, tone) { return '<span class="' + (tone ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25" : "bg-white/8 border border-white/10") + ' rounded-full px-3 py-1.5">' + inner + "</span>"; };
  if (!stats) { el.innerHTML = span("fichiers : —") + span("lignes : —") + span("tests : —") + span("dernier commit : —"); return; }
  var t = stats.tests || {}, c = stats.commits && stats.commits[0];
  var rel = "";
  if (c && c.at) {
    var mins = Math.max(1, Math.round((Date.now() - new Date(c.at).getTime()) / 60000));
    rel = mins < 90 ? "il y a " + mins + " min" : "il y a " + Math.round(mins / 60) + " h";
  }
  var subject = c ? String(c.subject || "") : "";
  if (subject.indexOf("{") !== -1 || subject.length > 42) subject = subject.split(":")[0];
  el.innerHTML =
    span("fichiers : " + fmt(stats.project && stats.project.files)) +
    span("lignes : " + fmt(stats.project && stats.project.loc)) +
    span(t.count ? "tests : " + fmt(t.count) + " verts" : "tests : —", t.count > 0 && t.fail === 0) +
    span(c ? "dernier commit : " + esc(c.sha) + " — " + esc(subject.slice(0, 42)) + (rel ? " (" + rel + ")" : "") : "dernier commit : —");
}

// ---------- CODE SOURCE (lu depuis GitHub) ----------
var treeLoaded = false, TREE = [], currentFile = null;
function ensureTree() {
  if (treeLoaded) return;
  treeLoaded = true;
  fetchJSON(CFG.repoApi + "/git/trees/main?recursive=1", 12000).then(function (data) {
    TREE = (data.tree || []).filter(function (x) { return x.type === "blob"; })
      .map(function (x) { return x.path; })
      .filter(function (p) { return !/\.(png|jpg|jpeg|gif|webp|ico|svg|woff2?|ttf|eot|mp4|mp3)$/i.test(p) && !/\.lock$/.test(p); });
    TREE.sort();
    if ($("codeView")) $("codeView").textContent = "Sélectionnez un fichier dans l'arbre — le contenu est lu en direct depuis GitHub.";
    if ($("codeSource")) $("codeSource").textContent = "source : api.github.com — " + fmt(TREE.length) + " fichiers visibles";
    renderFiles("");
  }).catch(function (err) {
    if ($("fileTree")) $("fileTree").innerHTML = '<div class="state-empty text-left">Arbre indisponible pour le moment (limite de l\'API GitHub ou réseau). Utilisez le bouton « Ouvrir le dépôt » ci-dessus.</div>';
    if ($("codeSource")) $("codeSource").textContent = "source : api.github.com — indisponible (" + err.message + ")";
  });
}
function renderFiles(filter) {
  var tree = $("fileTree"); if (!tree) return;
  var q = (filter || "").toLowerCase();
  var list = TREE.filter(function (p) { return p.toLowerCase().indexOf(q) !== -1; }).slice(0, 400);
  if (!TREE.length) { tree.innerHTML = '<div class="state-empty">Chargement…</div>'; return; }
  tree.innerHTML = list.length ? list.map(function (p) {
    var icon = /\.ts$/.test(p) ? "TS" : /\.md$/.test(p) ? "MD" : /\.json$/.test(p) ? "{}" : /\.css$/.test(p) ? "#" : /\.html?$/.test(p) ? "<>" : "•";
    var on = p === currentFile;
    return '<button type="button" data-path="' + esc(p) + '" class="w-full text-left px-3 py-1.5 rounded-lg flex gap-2 items-center ' + (on ? "bg-[#F4F1EA] text-black font-semibold" : "hover:bg-white/5 text-white/75") + '"><span class="font-mono text-[10px] opacity-60 shrink-0">' + icon + '</span><span class="truncate">' + esc(p) + "</span></button>";
  }).join("") : '<div class="state-empty">Aucun fichier ne correspond à cette recherche.</div>';
  renderCodeTabs();
}
function renderCodeTabs() {
  var tabs = $("codeTabs"); if (!tabs) return;
  tabs.innerHTML = currentFile
    ? '<button class="px-3 py-1.5 rounded-lg font-mono text-[11px] bg-white text-black font-bold whitespace-nowrap">' + esc(currentFile.split("/").pop()) + "</button>"
    : '<span class="text-[11px] text-white/35 font-mono">sélectionnez un fichier dans l\'arbre</span>';
}
function filterFiles(v) { renderFiles(v); }
function highlight(code) {
  var e = esc(code);
  e = e.replace(/(\/\/[^\n]*)/g, '<span style="color:#6B7A6B">$1</span>');
  e = e.replace(/\b(import|export|from|const|let|var|async|await|return|function|interface|type|new|class|if|else|try|catch|throw)\b/g, '<span style="color:#C9A7FF">$1</span>');
  e = e.replace(/("([^"\n]*?)")/g, '<span style="color:#FFD479">$1</span>');
  return e.split("\n").map(function (l) { return '<span class="code-line">' + (l || " ") + "</span>"; }).join("\n");
}
function openFile(path) {
  currentFile = path;
  if ($("codePath")) $("codePath").textContent = path;
  if ($("codeMeta")) $("codeMeta").textContent = "chargement…";
  if ($("codeView")) $("codeView").textContent = "Chargement de " + path + " …";
  renderFiles(document.querySelector("#fileTree input") ? document.querySelector("#fileTree input").value : "");
  var url = CFG.repoRaw + "/" + path.split("/").map(encodeURIComponent).join("/");
  fetch(url, { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  }).then(function (text) {
    if ($("codeMeta")) $("codeMeta").textContent = fmt(text.split("\n").length) + " lignes • " + (path.split(".").pop() || "fichier").toUpperCase();
    if ($("codeView")) $("codeView").innerHTML = highlight(text.slice(0, 120000));
  }).catch(function (err) {
    if ($("codeMeta")) $("codeMeta").textContent = "indisponible";
    if ($("codeView")) $("codeView").textContent = "Impossible de charger ce fichier (" + err.message + "). Ouvrez le dépôt pour le consulter.";
  });
}
function delegationTree() {
  var tree = $("fileTree");
  if (!tree) return;
  tree.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-path]");
    if (b) openFile(b.getAttribute("data-path"));
  });
  var search = document.querySelector('input[oninput="filterFiles(this.value)"]');
  if (search) search.addEventListener("search", function () { renderFiles(search.value); });
}

// ---------- PROJET A-Z ----------
var AZ = {
  A: ["Architecture", "PHASE 01 — ORIGINES", "EN LIGNE", "omega est organisé en couches : un cœur pur qui décide et calcule sans effets de bord, un runtime qui exécute et mesure, et des interfaces (l'IDE, ce site) qui observent. Chaque décision est journalisée — la boucle d'autonomie s'auto-améliore sur une branche dédiée.", ["Cœur pur, testé hors réseau", "Runtime mesuré", "Décisions journalisées"]],
  B: ["Benchmarks", "PHASE 01 — ORIGINES", "EN LIGNE", "Chaque changement est mesuré sur 18 tâches cachées, avec plusieurs modèles (Flash, Pro, gpt-oss-20b…) et des stratégies numérotées (s1 à s14). Le classement compare réussite, coût et durée — et il est public, ici même.", ["18 tâches cachées", "Stratégies s1–s14", "Classement public"]],
  C: ["Code ouvert", "PHASE 01 — ORIGINES", "EN LIGNE", "Le dépôt est public : lecture et téléchargement libres, sans compte. La licence sera publiée avec la première release ; d'ici là, tout est lisible et vérifiable, ligne par ligne.", ["Dépôt public", "Lecture sans compte", "Licence à la release"]],
  D: ["Dashboard", "PHASE 02 — TRANSPARENCE", "EN LIGNE", "Les stats de ce site sont générées depuis la source du projet (journal d'autonomie, bench, tests) et publiées avec leur date de synchronisation. Quand une valeur manque, elle s'affiche « — » : jamais un chiffre inventé.", ["Source : dépôt public", "Date de synchro affichée", "Aucun chiffre simulé"]],
  E: ["Écosystème", "PHASE 02 — TRANSPARENCE", "EN COURS", "Skills curatés (vetting de licence et de contenu, quarantaine), extensions à scopes déclaratifs, packs de configuration : l'écosystème se construit par briques vérifiées, pas par catalogue gonflé.", ["Skills curatés", "Extensions à scopes", "Packs de configuration"]],
  F: ["Fiabilité", "PHASE 02 — TRANSPARENCE", "EN COURS", "Le bench tourne en continu et la suite de tests garde chaque fusion honnête. Les mesures publiques de disponibilité (uptime, pression) arriveront avec l'API de statistiques — elles ne seront affichées que réelles.", ["Tests avant fusion", "Bench continu", "Uptime : via API, à venir"]],
  G: ["Gouvernance", "PHASE 03 — COMMUNAUTÉ", "EN COURS", "Deux voies prévues pour les contributions : revue directe du créateur pour le code sensible, vote communautaire pour le reste. Le programme ouvrira avec les comptes approuvés, et ses règles seront publiées avant les premiers votes.", ["Revue du créateur", "Vote communautaire", "Règles publiées d'abord"]],
  H: ["Hastria", "PHASE 03 — COMMUNAUTÉ", "EN LIGNE", "Le nom du projet : « hasta » — aller jusqu'au bout — et l'idée d'une étoile qui guide. Un seul domaine, hastria.fun, sans sous-domaine.", ["Un seul domaine", "Sans sous-domaine", "Identité propre"]],
  I: ["Intégrations", "PHASE 03 — COMMUNAUTÉ", "VISION", "Connecter omega aux outils du quotidien (code, données, design, communication) via des connecteurs sandboxés à scopes minimaux, révocables en un clic. Rien ne sera annoncé disponible avant de l'être vraiment.", ["Scopes minimaux", "Révocables", "Annoncées quand prêtes"]],
  J: ["Journal", "PHASE 03 — COMMUNAUTÉ", "EN LIGNE", "Le journal d'autonomie consigne chaque itération : objectif, résultat, dépense. C'est la mémoire vérifiable du projet — et c'est lui qui alimente les statistiques de ce site.", ["Horodaté", "Dépense suivie", "Alimente ce site"]],
  K: ["Kits de démarrage", "PHASE 04 — PRODUIT", "VISION", "Des kits complets — templates du Builder, extensions préconfigurées, prompts — pour démarrer un projet pro rapidement. Au programme une fois le Builder publié.", ["Templates Builder", "Préconfigurés", "Après la publication"]],
  L: ["Latence", "PHASE 04 — PRODUIT", "EN COURS", "La latence de chaque combo est mesurée pendant les benchmarks et figure dans le classement. La cible et les seuils seront annoncés avec l'API publique — pas avant d'être mesurables.", ["Mesurée au bench", "Classement public", "Seuils : via API"]],
  M: ["Multi-modèles", "PHASE 04 — PRODUIT", "EN LIGNE", "Le cœur d'omega : plusieurs modèles de plusieurs fournisseurs comparés en continu, avec routing et stratégies expérimentés dans la boucle d'autonomie — visible dans le classement du bench.", ["Plusieurs fournisseurs", "Comparés en continu", "Routing mesuré"]],
  N: ["Neutralité", "PHASE 04 — PRODUIT", "EN LIGNE", "Aucun modèle favori par défaut : les classements ne suivent que les mesures du bench (réussite, coût, durée), et la pondération est visible dans le dépôt public.", ["Mesures ouvertes", "Pondérations visibles", "Aucun partenariat caché"]],
  O: ["omega", "PHASE 05 — SYSTÈME", "EN LIGNE", "omega est le nom du système : le dernier arbitre entre les modèles. Sa boucle d'autonomie s'auto-améliore sur une branche dédiée, avec un plafond de budget et un arrêt d'urgence — c'est mesuré, pas promis.", ["Boucle autonome", "Budget plafonné", "Arrêt d'urgence"]],
  P: ["Plugins", "PHASE 05 — SYSTÈME", "EN COURS", "Le branchement se fera par scopes déclarés, sandbox et révocation immédiate. La démo interactive de ce site montre exactement le parcours — sans prétendre qu'il est déjà ouvert.", ["Sandbox", "Scopes déclarés", "Démo interactive"]],
  Q: ["Qualité", "PHASE 05 — SYSTÈME", "EN COURS", "La qualité de chaque combo est mesurée par le taux de tâches résolues du bench, et rien d'autre. Le classement réel est dans les stats publiques de ce site.", ["Taux de réussite", "Coût comparé", "Classement réel"]],
  R: ["Routage", "PHASE 05 — SYSTÈME", "EN COURS", "Router chaque requête vers le bon modèle selon la complexité et le coût : c'est le cœur du projet. Les stratégies de routage s1 à s14 sont testées dans le bench, publiquement.", ["Stratégies s1–s14", "Testées au bench", "En évolution"]],
  S: ["Sandbox et scopes", "PHASE 06 — SÉCURITÉ", "EN COURS", "Ni accès aux fichiers, ni shell, ni secrets par défaut : les extensions déclarent ce dont elles ont besoin, et rien de plus. Journalisées, révocables, arrêtables.", ["Sans privilèges par défaut", "Journalisée", "Révocable"]],
  T: ["Transparence", "PHASE 06 — SÉCURITÉ", "EN LIGNE", "Stats, code, journal, mesures : ce site publie la source de tout ce qu'il affiche. La transparence est l'architecture, pas une page marketing.", ["Source publique", "Vérifiable", "Sans vitrine trompeuse"]],
  U: ["Utilisateurs vérifiés", "PHASE 06 — SÉCURITÉ", "EN COURS", "Le badge vérifié se gagnera par des contributions approuvées, jamais par une inscription. L'ouverture se fera avec les comptes approuvés.", ["Badge mérité", "Contributions approuvées", "Ouverture à venir"]],
  V: ["Vote communautaire", "PHASE 07 — GOUVERNANCE", "VISION", "Pour les extensions, templates et documentation : vote avec quorum et seuil d'approbation, règles publiées avant la première élection. Le programme n'ouvrira pas avant d'être prêt.", ["Quorum", "Seuil d'approbation", "Règles d'abord"]],
  W: ["Web Builder Pro", "PHASE 07 — GOUVERNANCE", "EN LIGNE", "Le Builder est utilisable maintenant, dans votre navigateur : 4 templates, palettes, sections, export HTML — l'aperçu est immédiat, sans compte. La publication à hastria.fun/s/<slug> ouvrira avec les comptes approuvés.", ["4 templates", "Export HTML", "Publication sur approbation"]],
  X: ["Expérience", "PHASE 08 — VISION", "EN LIGNE", "Ce site : éditorial, sombre, lisible — sans pop-up ni newsletter forcée. Les pages publiques sont lisibles sans compte, y compris pour les moteurs de recherche.", ["Lisible sans compte", "Sans pop-up", "Indexable"]],
  Y: ["Yield — rendement", "PHASE 08 — VISION", "EN COURS", "Le coût par combo est déjà suivi dans le bench (dollars par combo mesuré). L'objectif est d'optimiser le coût par tâche réussie — et le classement public dira si c'est le cas.", ["Coût par combo", "Suivi au bench", "Classement public"]],
  Z: ["Zéro confiance", "PHASE 08 — VISION", "VISION", "Le principe qui clôt l'alphabet : ne rien croire sur parole — extension sandboxée, scope vérifié, chiffre traçable. De A à Z, ce qui n'est pas mesuré n'est pas affiché.", ["Rien par défaut", "Tout vérifiable", "Mesuré ou rien"]]
};
function selectAZ(l) {
  var d = AZ[l]; if (!d) return;
  document.querySelectorAll("[data-az]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-az") === l); });
  $("azLetter").textContent = l;
  $("azTitle").textContent = d[0];
  $("azPhase").textContent = d[1];
  $("azStatus").textContent = d[2];
  $("azText").textContent = d[3];
  $("azFacts").innerHTML = d[4].map(function (f) { return '<div class="bg-white/5 border border-white/8 rounded-xl p-3.5 text-[13px] font-semibold leading-snug">' + esc(f) + "</div>"; }).join("");
}
function initAZ() {
  var nav = $("azNav"); if (!nav) return;
  nav.innerHTML = Object.keys(AZ).map(function (l) { return '<button class="az-btn ' + (l === "A" ? "active" : "") + '" data-az="' + l + '" onclick="selectAZ(\'' + l + '\')">' + l + "</button>"; }).join("");
  selectAZ("A");
  var ROAD = [
    ["Stats publiques générées du dépôt", "EN LIGNE", "emerald"],
    ["Bench multi-modèles (s1–s14)", "EN LIGNE", "emerald"],
    ["Comptes (Google + e-mail) et approbation", "EN COURS", "amber"],
    ["Publication de sites /s/<slug>", "EN COURS", "amber"],
    ["Catalogue d'extensions à scopes", "VISION", "violet"],
    ["Store de modules", "VISION", "violet"]
  ];
  $("roadmap").innerHTML = ROAD.map(function (r) {
    var tone = r[2] === "emerald" ? "bg-emerald-400/15 text-emerald-300" : r[2] === "amber" ? "bg-amber-400/15 text-amber-300" : "bg-violet-400/15 text-violet-300";
    return '<div class="flex items-center justify-between gap-3"><span class="text-sm font-semibold text-white/80">' + r[0] + '</span><span class="text-[10px] font-mono px-2 py-1 rounded-full ' + tone + '">' + r[1] + "</span></div>";
  }).join("");
}

// ---------- PLUGINS (démo d'interface étiquetée) ----------
var DEMO_PLUGINS = [
  { id: 1, name: "Calendar Brief", icon: "C", cat: "Productivité", scopes: ["calendar.read"], desc: "Exemple fictif : un brief de préparation avant chaque réunion, en lecture seule sur le calendrier. Aucun envoi d'e-mail, aucune écriture." },
  { id: 2, name: "API Monitor", icon: "A", cat: "Développement", scopes: ["network.api"], desc: "Exemple fictif : surveille uniquement les URL de santé que vous déclarez explicitement — rien d'autre n'est joignable." }
];
var currentPlugin = null, selectedScope = "";
function setScope(s) { selectedScope = s; renderPlugins(); }
function renderPlugins() {
  var q = ($("pluginSearch") && $("pluginSearch").value || "").toLowerCase();
  var list = DEMO_PLUGINS.filter(function (p) {
    return (!selectedScope || p.scopes.indexOf(selectedScope) !== -1) &&
      (p.name.toLowerCase().indexOf(q) !== -1 || p.scopes.join(" ").indexOf(q) !== -1 || p.cat.toLowerCase().indexOf(q) !== -1);
  });
  document.querySelectorAll(".scope-btn").forEach(function (b) {
    var on = b.getAttribute("data-scope") === selectedScope;
    b.style.background = on ? "#F4F1EA" : "";
    b.style.color = on ? "#07070B" : "";
  });
  var grid = $("pluginsGrid"); if (!grid) return;
  grid.innerHTML = list.length ? list.map(function (p) {
    return '<article class="card p-5 flex flex-col"><div class="flex justify-between"><span class="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500/30 to-emerald-400/20 grid place-items-center font-mono font-bold text-violet-200">' + p.icon + '</span><span class="badge-demo">EXEMPLE</span></div><h3 class="font-bold text-[17px] mt-4">' + esc(p.name) + '</h3><p class="text-[13px] text-white/50 mt-0.5">' + esc(p.cat) + ' • exemple de démonstration</p><p class="text-sm text-white/60 leading-relaxed mt-2.5 flex-1">' + esc(p.desc) + '</p><div class="flex flex-wrap gap-1.5 mt-3">' + p.scopes.map(function (s) { return '<span class="font-mono text-[10px] bg-black/40 border border-white/10 rounded-md px-2 py-1 text-emerald-300">' + s + "</span>"; }).join("") + '</div><div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/8"><button onclick="openPlugin(' + p.id + ')" class="btn-outline justify-center !py-2.5 text-[13px]">Voir le branchement</button><button disabled class="rounded-full py-2.5 text-[13px] font-bold bg-white/8 text-white/35 cursor-not-allowed border border-white/10">Brancher — bientôt</button></div></article>';
  }).join("") : '<p class="text-white/50 col-span-full card p-8 text-center">Aucun exemple ne correspond à ce filtre.</p>';
}
function initScopeFilters() {
  var el = $("scopeFilters"); if (!el) return;
  var scopes = [];
  DEMO_PLUGINS.forEach(function (p) { p.scopes.forEach(function (s) { if (scopes.indexOf(s) === -1) scopes.push(s); }); });
  el.innerHTML = '<button onclick="setScope(\'\')" class="scope-btn chip !normal-case !tracking-normal font-sans font-semibold" data-scope="">Tous les scopes</button>' +
    scopes.map(function (s) { return '<button onclick="setScope(\'' + s + '\')" class="scope-btn chip !normal-case !tracking-normal font-sans font-semibold" data-scope="' + s + '">' + s + "</button>"; }).join("");
}
function openPlugin(id) {
  currentPlugin = DEMO_PLUGINS.filter(function (p) { return p.id === id; })[0];
  if (!currentPlugin) return;
  $("pmIcon").textContent = currentPlugin.icon;
  $("pmName").textContent = currentPlugin.name;
  $("pmAuthor").textContent = "Exemple fictif — démonstration d'interface • " + currentPlugin.cat;
  $("pmDesc").textContent = currentPlugin.desc;
  $("pmScopes").innerHTML = currentPlugin.scopes.map(function (s) { return '<span class="font-mono text-[11px] bg-emerald-400/10 border border-emerald-400/25 text-emerald-300 rounded-lg px-2.5 py-1.5">' + s + "</span>"; }).join("");
  openModal($("pluginModal"));
}
function closePlugin() { closeModal($("pluginModal")); }
function installPlugin() {
  closePlugin();
  toast("Démonstration : aucun module n'est réellement branché. Le catalogue ouvrira avec les comptes approuvés.");
}

// ---------- BUILDER (fonctionne réellement, en local) ----------
var bTemplate = "Agence", bPalette = 0, bDevice = "desktop";
var bSectionsState = { hero: true, features: true, pricing: true, faq: false, cta: true };
var PALETTES = [
  { name: "Violet omega", bg: "#7C6CFF", soft: "#EFEFFF", ink: "#12121A" },
  { name: "Émeraude", bg: "#00B894", soft: "#E9FBF4", ink: "#0C1A16" },
  { name: "Noir éditorial", bg: "#111116", soft: "#F4F1EA", ink: "#111116" },
  { name: "Corail", bg: "#FF6B4A", soft: "#FFF1EC", ink: "#221110" }
];
var TEMPLATES = ["Agence", "SaaS", "Portfolio", "E-commerce"];
function initBuilder() {
  if (!$("bTemplates")) return;
  $("bTemplates").innerHTML = TEMPLATES.map(function (t) {
    return '<button onclick="setTemplate(\'' + t + '\')" data-tpl="' + t + '" class="tpl-btn border rounded-xl py-3 text-[13px] font-bold ' + (t === bTemplate ? "bg-[#F4F1EA] text-black border-white" : "border-white/15 hover:bg-white/5") + '">' + t + "</button>";
  }).join("");
  $("bPalettes").innerHTML = PALETTES.map(function (p, i) {
    return '<button onclick="setPalette(' + i + ')" title="' + p.name + '" class="w-10 h-10 rounded-full border-2 ' + (i === 0 ? "border-white" : "border-white/20") + ' palette-btn" data-pal="' + i + '" style="background:' + p.bg + '"></button>';
  }).join("") + '<span class="text-xs text-white/50 self-center ml-1" id="palName">Violet omega</span>';
  $("bSections").innerHTML = Object.keys(bSectionsState).map(function (k) {
    var labels = { hero: "Hero", features: "Fonctionnalités", pricing: "Tarifs", faq: "FAQ", cta: "Appel à l'action" };
    return '<div class="flex items-center justify-between bg-white/[0.04] rounded-xl px-3.5 py-2.5"><span class="text-sm font-medium capitalize">' + labels[k] + '</span><span class="toggle ' + (bSectionsState[k] ? "on" : "") + '" data-sec="' + k + '" onclick="toggleSection(\'' + k + '\',this)"></span></div>';
  }).join("");
  document.querySelectorAll("#bDevice button").forEach(function (b) {
    b.addEventListener("click", function () {
      bDevice = b.getAttribute("data-dev");
      document.querySelectorAll("#bDevice button").forEach(function (x) {
        x.className = "py-2 rounded-lg text-xs font-bold " + (x.getAttribute("data-dev") === bDevice ? "bg-white text-black" : "text-white/60");
      });
      renderBuilder();
    });
  });
  renderBuilder();
}
function setTemplate(t) {
  bTemplate = t;
  document.querySelectorAll(".tpl-btn").forEach(function (b) {
    var on = b.getAttribute("data-tpl") === t;
    b.className = "tpl-btn border rounded-xl py-3 text-[13px] font-bold " + (on ? "bg-[#F4F1EA] text-black border-white" : "border-white/15 hover:bg-white/5");
  });
  renderBuilder();
}
function setPalette(i) {
  bPalette = i;
  $("palName").textContent = PALETTES[i].name;
  document.querySelectorAll(".palette-btn").forEach(function (b) { b.style.borderColor = (+b.getAttribute("data-pal") === i ? "white" : "rgba(255,255,255,.2)"); });
  renderBuilder();
}
function toggleSection(k, el) {
  bSectionsState[k] = !bSectionsState[k];
  el.classList.toggle("on", bSectionsState[k]);
  renderBuilder();
}
function renderBuilder() {
  if (!$("bPreview")) return;
  var name = $("bName").value || "Mon site";
  var headline = $("bHeadline").value || "Bienvenue";
  var pal = PALETTES[bPalette];
  var slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mon-site";
  if ($("bShareLink")) $("bShareLink").textContent = "hastria.fun/s/" + slug;
  if ($("bUrlBar")) $("bUrlBar").textContent = "hastria.fun/s/" + slug;
  var width = bDevice === "mobile" ? "max-width:380px" : bDevice === "tablet" ? "max-width:640px" : "max-width:920px";
  var h = '<div style="' + width + '" class="mx-auto bg-white text-[#141419] rounded-[18px] overflow-hidden shadow-2xl text-left transition-all">';
  h += '<div class="flex items-center justify-between px-6 h-14 border-b border-black/8"><span class="font-bold tracking-tight" style="font-family:Space Grotesk">' + esc(name) + '</span><span class="hidden sm:flex gap-4 text-[12px] font-medium text-black/55"><span>Accueil</span><span>Services</span><span>Tarifs</span><span>Contact</span></span><span class="text-[12px] font-bold text-white px-3.5 py-2 rounded-full" style="background:' + pal.bg + '">Commencer</span></div>';
  if (bSectionsState.hero) h += '<div class="px-6 sm:px-10 py-12 sm:py-16" style="background:' + pal.soft + '"><p class="text-[10px] font-bold tracking-[.18em]" style="color:' + pal.bg + '">' + bTemplate.toUpperCase() + ' — PROPULSÉ PAR HASTRIA OMEGA</p><h1 class="text-[30px] sm:text-[42px] font-bold leading-[1.04] tracking-tight mt-3" style="font-family:Space Grotesk">' + esc(headline) + '</h1><p class="text-black/55 text-[14px] leading-relaxed mt-3 max-w-[440px]">Site préparé avec le Builder Hastria Pro : export HTML immédiat, publication sur approbation une fois les comptes ouverts.</p><div class="flex gap-2 mt-6"><span class="text-[13px] font-bold text-white px-5 py-3 rounded-full" style="background:' + pal.bg + '">Demander une démo</span><span class="text-[13px] font-bold px-5 py-3 rounded-full border border-black/15">Nos réalisations</span></div></div>';
  if (bSectionsState.features) h += '<div class="px-6 sm:px-10 py-10 grid sm:grid-cols-3 gap-4">' + [["Léger", "Chargement rapide, sans dépendance externe."], ["Lisible", "Structure sémantique et balisage propre."], ["Propulsé par omega", "Contenus assistés par le système multi-modèles."]].map(function (f) {
    return '<div class="border border-black/8 rounded-2xl p-4"><p class="w-8 h-8 rounded-lg grid place-items-center text-white text-sm font-bold mb-3" style="background:' + pal.bg + '">✓</p><p class="font-bold text-[14px]">' + f[0] + '</p><p class="text-[12px] text-black/50 leading-relaxed mt-1">' + f[1] + "</p></div>";
  }).join("") + "</div>";
  if (bSectionsState.pricing) h += '<div class="px-6 sm:px-10 pb-10"><p class="font-bold text-[20px]" style="font-family:Space Grotesk">Tarifs — exemple</p><div class="grid sm:grid-cols-3 gap-3 mt-4">' + [["Essentiel", "19 $/mois", false], ["Pro", "49 $/mois", true], ["Équipe", "99 $/mois", false]].map(function (p) {
    return '<div class="rounded-2xl p-5 ' + (p[2] ? "text-white" : "border border-black/10") + '" style="' + (p[2] ? "background:" + pal.bg : "") + '"><p class="text-[12px] font-bold ' + (p[2] ? "text-white/70" : "text-black/45") + '">' + p[0] + '</p><p class="font-bold text-[22px] mt-1">' + p[1] + '</p><p class="text-[12px] ' + (p[2] ? "text-white/75" : "text-black/50") + ' mt-2 leading-relaxed">Contenu d’exemple — remplacez-le par le vôtre.</p></div>';
  }).join("") + "</div></div>";
  if (bSectionsState.faq) h += '<div class="px-6 sm:px-10 pb-10 space-y-2">' + [["Puis-je utiliser mon domaine ?", "Le Builder exporte un HTML autonome ; la publication sur hastria.fun ouvrira avec les comptes approuvés."], ["Le site est-il indexé ?", "L’export inclut une structure sémantique propre ; l’indexation dépend de votre hébergement."]].map(function (f) {
    return '<div class="border border-black/8 rounded-xl px-4 py-3.5"><p class="font-bold text-[13px]">' + f[0] + '</p><p class="text-[12px] text-black/50 mt-1">' + f[1] + "</p></div>";
  }).join("") + "</div>";
  if (bSectionsState.cta) h += '<div class="mx-6 sm:mx-10 mb-10 rounded-2xl px-6 py-8 text-center text-white" style="background:' + pal.ink + '"><p class="font-bold text-[20px]" style="font-family:Space Grotesk">Prêt à lancer ' + esc(name) + ' ?</p><p class="text-white/60 text-[13px] mt-1.5">Exportez le HTML et hébergez-le où vous voulez.</p><span class="inline-block bg-white text-black text-[13px] font-bold px-5 py-3 rounded-full mt-4">Commencer</span></div>';
  h += '<div class="px-6 py-5 bg-black/[0.03] flex justify-between text-[11px] text-black/40 font-medium"><span>© 2026 ' + esc(name) + '</span><span>Préparé avec Hastria Builder Pro</span></div></div>';
  $("bPreview").innerHTML = h;
}
function copyShare() {
  toast("Le lien public hastria.fun/s/<slug> ouvrira avec la publication. L'export HTML est disponible dès maintenant.");
}
function exportBuilder() {
  var blob = new Blob([document.getElementById("bPreview").innerHTML], { type: "text/html" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "site-hastria.html";
  a.click();
  toast("Code HTML exporté — prêt à héberger où vous voulez.");
}

// ---------- INITIALISATION ----------
function initMarquee() {
  var el = $("marquee"); if (!el) return;
  var items = ["MULTI-MODÈLES", "STATS PUBLIQUES", "CODE OUVERT", "ROUTAGE MESURÉ", "BUILDER PRO + EXPORT", "BRANCHEMENT À SCOPES", "COMPTES VÉRIFIÉS", "STORE — EN CONSTRUCTION"];
  var seq = items.map(function (i) { return '<span class="mx-5 inline-flex items-center gap-5">' + i + ' <span class="text-[#7C6CFF]">·</span></span>'; }).join("");
  el.innerHTML = '<div class="flex shrink-0">' + seq + '</div><div class="flex shrink-0">' + seq + "</div>";
}
function initVerifiedList() {
  var el = $("verifiedList"); if (!el) return;
  el.innerHTML = '<div class="state-empty"><strong>Les premiers profils vérifiés apparaîtront ici.</strong><br>Le badge se gagne par une contribution approuvée — jamais par une inscription. Aucune donnée fictive n’est affichée.</div>';
}
function initClock() {
  var el = $("liveClock"); if (!el) return;
  var tick = function () { el.textContent = new Date().toLocaleTimeString("fr-FR") + " — heure locale"; };
  tick(); setInterval(tick, 1000);
}
function init() {
  initMarquee();
  initVerifiedList();
  initClock();
  initAZ();
  initScopeFilters();
  renderPlugins();
  initBuilder();
  delegationTree();
  loadStats(false);
  var h = location.hash.replace("#", "");
  if (h && $("page-" + h)) showPage(h);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
