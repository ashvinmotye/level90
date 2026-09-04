"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const readme = fs.readFileSync(path.join(root,"README.md"),"utf8");

assert.match(html,/id="ascentStage" class="ascent-stage"/);
assert.match(html,/id="ascentRouteMap"[^>]*viewBox="0 0 520 620"[^>]*preserveAspectRatio="xMidYMid meet"/);
assert.match(html,/id="ascentHistoryRidges"/);
assert.match(html,/id="ascentRouteBase"/);
assert.match(html,/id="ascentRouteProgress"[^>]*pathLength="100"/);
assert.match(html,/class="ascent-terrain"[^>]*preserveAspectRatio="xMidYMid slice"/);

assert.match(css,/\/\* Version 50 · Responsive Ridges \*\//);
assert.match(css,/\.ascent-stage \{[^}]*aspect-ratio:3 \/ 4/);
assert.match(css,/\.ascent-route-map \{[^}]*position:absolute[^}]*inset:0[^}]*width:100%; height:100%/);
assert.match(css,/\.ascent-world \.ascent-stage \.level-orb \{[^}]*position:absolute[^}]*top:11\.5%[^}]*left:50%/);
assert.match(css,/\.ascent-world \.ascent-stage \.next-level-copy \{[^}]*position:absolute/);
assert.match(css,/\.ascent-history-ridge/);
assert.match(css,/\.ascent-route-progress\.route-resetting \{ transition:none; \}/);
assert.doesNotMatch(css,/offset-path:path/);

assert.match(app,/const ASCENT_RIDGES = \[/);
assert.ok((app.match(/path:"M/g) || []).length >= 5,"expected five ascent ridge shapes");
assert.match(app,/function ascentRidgeForLevel\(/);
assert.match(app,/function renderAscentRidge\(/);
assert.match(app,/history\.innerHTML=Array\.from/);
assert.match(app,/route\.style\.strokeDasharray=`\$\{routeProgress\} 100`/);
assert.match(app,/function animateRouteToSummit\(/);
assert.match(app,/route\.style\.strokeDasharray="100 100"/);
assert.match(app,/animateRouteToSummit\(\)\.then\(renderCompletedState\)/);
assert.match(app,/route\.getScreenCTM/);
assert.match(app,/route\.getPointAtLength/);
assert.match(app,/p\.maxed \? "SUMMIT HELD"/);

assert.match(serviceWorker,/level90-v50/);
assert.match(readme,/## Version 50 Responsive Ridges/);

console.log("Level90 Version 50 responsive ridge tests passed");
