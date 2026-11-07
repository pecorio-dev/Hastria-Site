#!/usr/bin/env node
// Génère stats.json : instantané de statistiques RÉELLES du projet Hastria/omega.
// Zéro dépendance npm, zéro réseau. Lecture seule du dépôt source (OMEGA_ROOT).
// N'écrit que stats.json (à côté de la racine du projet, pas dans le dépôt source).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- Emplacements ----------
const scriptDir = dirname(fileURLToPath(import.meta.url)) // .../hastria-site/scripts
const projectRoot = resolve(scriptDir, '..') // .../hastria-site
const outFile = join(projectRoot, 'stats.json')

// Racine du dépôt source : OMEGA_ROOT, sinon ../opencode-omega relatif à la racine du projet.
const omegaRoot = process.env.OMEGA_ROOT
  ? (isAbsolute(process.env.OMEGA_ROOT) ? process.env.OMEGA_ROOT : resolve(projectRoot, process.env.OMEGA_ROOT))
  : resolve(projectRoot, '..', 'opencode-omega')

const p = (f) => join(omegaRoot, f)
const read = (f) => (existsSync(p(f)) ? readFileSync(p(f), 'utf8') : '')

// ---------- Helpers ----------
const numOrNull = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function git(args) {
  try {
    return execFileSync('git', args, { cwd: omegaRoot, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// ---------- Journal d'autonomie ----------
const journal = read('autonomy/journal.md')

// iterations : plus haut numéro d'itération rencontré (comme readme-stats.mjs)
let iterations = null
for (const m of journal.matchAll(/## Itération (\d+)/g)) {
  const n = Number(m[1])
  if (iterations === null || n > iterations) iterations = n
}

// runs : nombre total d'itérations consignées dans le journal
const runs = (journal.match(/## Itération \d+/g) || []).length || null

// history : dépense cumulée par itération (« dépensé cumulé: X $ » rattachée à l'itération courante)
const history = []
let currentIteration = null
for (const line of journal.split('\n')) {
  const it = line.match(/## Itération (\d+)/)
  if (it) {
    currentIteration = Number(it[1])
    continue
  }
  const sp = line.match(/dépensé cumulé:\s*([\d.]+)\s*\$/)
  if (sp && currentIteration !== null) {
    history.push({ iteration: currentIteration, usd: Number(sp[1]) })
  }
}
history.sort((a, b) => a.iteration - b.iteration)
if (history.length > 500) history.length = 500

// loop_usd : dernière dépense cumulée du journal (null si absente)
const loopUsd = history.length ? history[history.length - 1].usd : null

// loop_cap_usd : plafond de budget de la config d'autonomie
let loopCap = 20
try {
  const cfg = JSON.parse(read('autonomy/config.json'))
  const cap = numOrNull(cfg.budgetCapUsd)
  if (cap !== null) loopCap = cap
} catch { /* défaut documenté, cf. readme-stats.mjs */ }

// ---------- Tests ----------
let tests = null
const testLogPath = process.env.TEST_LOG
if (testLogPath && existsSync(testLogPath)) {
  const testLog = readFileSync(testLogPath, 'utf8')
  const ran = testLog.match(/Ran\s+(\d+)\s+tests?\s+across\s+(\d+)\s+files?/)
  if (ran) {
    const exp = testLog.match(/(\d+)\s+expect\(\)\s+calls/)
    const fail = testLog.match(/(\d+)\s+fail/)
    tests = {
      count: Number(ran[1]),
      files: Number(ran[2]),
      assertions: exp ? Number(exp[1]) : null,
      fail: fail ? Number(fail[1]) : null,
      at: new Date().toISOString(),
    }
  }
}
if (!tests && existsSync(p('results/test-summary.json'))) {
  try {
    const s = JSON.parse(read('results/test-summary.json'))
    tests = {
      count: numOrNull(s.count),
      files: numOrNull(s.files),
      assertions: numOrNull(s.expect),
      fail: numOrNull(s.fail),
      at: typeof s.at === 'string' ? s.at : null,
    }
  } catch {
    tests = null
  }
}

// ---------- Bench ----------
const bench = []
for (const line of read('bench/results/leaderboard.md').split('\n')) {
  const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(\d+)\/(\d+)\s*\|\s*([\d.]+)\s*%\s*\|\s*([\d.]+)\s*\$\s*\|\s*(\d+)\s*s\s*\|/)
  if (m) {
    bench.push({
      combo: m[1],
      ok: Number(m[2]),
      total: Number(m[3]),
      rate: Number(m[4]),
      cost: Number(m[5]),
      sec: Number(m[6]),
    })
  }
}

// ---------- Stratégies (design §10) ----------
const spec = read('docs/specs/2026-11-07-opencode-omega-design.md')
let strategies = null
for (let i = 1; i <= 30; i++) {
  if (spec.includes(`s${i}`)) strategies = i
}

// ---------- Fichiers suivis / lignes de code ----------
let files = null
let loc = null
const lsFiles = git(['ls-files'])
if (lsFiles) {
  files = 0
  loc = 0
  for (const f of lsFiles.split('\n')) {
    if (!f) continue
    try {
      const st = statSync(p(f))
      if (!st.isFile() || st.size > 2_000_000) continue
      const buf = readFileSync(p(f))
      if (buf.includes(0)) continue // binaire
      files++
      loc += buf.toString('utf8').split('\n').length
    } catch { /* fichier disparu */ }
  }
}

// ---------- Dépôt git ----------
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || null
const commits = []
// Séparateur \x1f : un sujet de commit peut contenir « | », pas ce caractère de contrôle.
for (const line of git(['log', '-6', '--pretty=format:%h%x1f%s%x1f%cI']).split('\n')) {
  if (!line) continue
  const [sha, subject, at] = line.split('\x1f')
  if (!sha || at === undefined) continue
  commits.push({ sha, subject: subject ?? '', at })
}

// ---------- Assemblage ----------
const stats = {
  schema: 1,
  generated_at: new Date().toISOString(),
  source: "journal d'autonomie, bench et tests du dépôt pecorio-dev/Hastria",
  repo: { url: 'https://github.com/pecorio-dev/Hastria', branch },
  project: { iterations, strategies, files, loc },
  tests,
  bench: { tasks: 18, combos: bench },
  cost: { loop_usd: loopUsd, loop_cap_usd: loopCap },
  autonomy: { history, branch, runs },
  commits,
}

writeFileSync(outFile, JSON.stringify(stats, null, 2) + '\n', { encoding: 'utf8' })

// ---------- Sortie console ----------
console.log(`build-stats: ${outFile}`)
console.log(`  source dépôt        : ${omegaRoot}`)
console.log(`  branche             : ${branch ?? '?'}`)
console.log(`  itérations (max)    : ${iterations ?? '?'}`)
console.log(`  runs (entrées)      : ${runs ?? '?'}  · history=${history.length} points`)
console.log(`  stratégies          : ${strategies ?? '?'}`)
console.log(`  fichiers / lignes   : ${files ?? '?'} / ${loc ?? '?'}`)
console.log(`  tests               : ${tests ? `${tests.count} tests · ${tests.files} fichiers · ${tests.assertions ?? '?'} assertions · ${tests.fail ?? '?'} échec` : 'aucun'}`)
console.log(`  bench               : ${bench.length} combos · ${bench.map((b) => `${b.combo} ${b.ok}/${b.total}`).join(' | ')}`)
console.log(`  dépense boucle      : ${loopUsd != null ? loopUsd.toFixed(4) : '?'} $ / ${loopCap} $`)
console.log(`  commits récents     : ${commits.length}`)
