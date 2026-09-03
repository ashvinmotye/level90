"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const cloud = fs.readFileSync(path.join(root,"cloud.js"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const readme = fs.readFileSync(path.join(root,"README.md"),"utf8");

assert.match(html,/id="showcaseModeButton"/);
assert.match(html,/id="showcaseBanner"[^>]*hidden/);
assert.match(html,/class="today-layout"/);
assert.match(html,/id="ascentWorld"/);
assert.match(html,/id="ascentRouteProgress"[^>]*pathLength="100"/);
assert.match(html,/id="ascentEnergy"/);
assert.match(html,/>Life Terrain</);
assert.match(html,/>NEW RIDGE REVEALED</);
assert.match(html,/styles\.css\?v=48/);
assert.match(html,/app\.js\?v=48/);

assert.match(css,/\/\* Version 47 · Ascension Lines \*\//);
assert.match(css,/\.ascent-world/);
assert.match(css,/\.ascent-route-progress/);
assert.match(css,/\.ascent-world\.energy-climbing \.ascent-energy/);
assert.match(css,/@media \(min-width: 900px\)[\s\S]*\.today-layout \{ display:grid;/);
assert.match(css,/@media \(max-width: 520px\)[\s\S]*\.today-quest-grid \{ grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/\.quest-progress-stats > span \{[^}]*border:0/);
assert.match(css,/\.character-ridge-node/);
assert.match(css,/\.life-terrain-panel/);

assert.match(app,/function buildShowcaseState\(/);
assert.match(app,/function startLevel90Showcase\(/);
assert.match(app,/function exitLevel90Showcase\(/);
assert.match(app,/if \(showcaseMode\) \{[\s\S]*lastSavedStateJson/);
assert.match(app,/function animateAscentEnergy\(/);
assert.match(app,/route\.style\.strokeDasharray/);
assert.match(app,/data-ridge="\$\{ridgeIndex\}"/);
assert.match(cloud,/function level90RevealShowcase\(/);
assert.match(cloud,/!window\.level90ShowcaseActive/);
assert.match(serviceWorker,/level90-v48/);
assert.match(readme,/## Version 47 Ascension Lines/);

console.log("Level90 Version 47 Ascension Lines tests passed");
