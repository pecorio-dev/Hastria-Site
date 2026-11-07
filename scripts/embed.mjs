#!/usr/bin/env node
// Assemble index.html : CSS Tailwind compilé (marqueurs TW) + moteur JS (marqueurs APP).
// Idempotent : relançable après chaque modification de app.js ou du HTML.
import { readFileSync, writeFileSync } from "node:fs"

const html = readFileSync("index.html", "utf8")
const css = readFileSync("assets/tailwind.css", "utf8")
const app = readFileSync("app.js", "utf8")

if (!/<!-- TW:START -->[\s\S]*?<!-- TW:END -->/.test(html)) throw new Error("marqueurs TW:START/TW:END absents de index.html")
if (!/\/\/ APP:START[\s\S]*?\/\/ APP:END/.test(html)) throw new Error("marqueurs APP:START/APP:END absents de index.html")

let out = html
out = out.replace(/<!-- TW:START -->[\s\S]*?<!-- TW:END -->/, () => "<!-- TW:START -->\n<style>" + css + "</style>\n<!-- TW:END -->")
out = out.replace(/\/\/ APP:START[\s\S]*?\/\/ APP:END/, () => "// APP:START\n" + app.trimEnd() + "\n// APP:END")
writeFileSync("index.html", out)
console.log("embed: index.html assemblé — " + out.length + " octets")
