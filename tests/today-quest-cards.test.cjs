"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const readme = fs.readFileSync(path.join(root,"README.md"),"utf8");

assert.match(css,/\/\* Version 48 · Ascension Quest Cards \*\//);
assert.match(css,/\.today-quest-grid \{ grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/\.quest-card\.today-tile \{[\s\S]*?grid-template-columns:64px minmax\(0,1fr\) auto/);
assert.match(css,/\.today-completion-medallion/);
assert.match(css,/\.tile-completion-count \{[\s\S]*?position:absolute; right:-4px; bottom:-3px/);
assert.match(css,/\.tile-completion-tools\[hidden\] \{ display:none; \}/);
assert.match(css,/@media \(max-width: 520px\)[\s\S]*?\.today-quest-grid \{ grid-template-columns:minmax\(0,1fr\)/);

assert.match(app,/class="today-completion-medallion \$\{done \? "is-complete" : ""\}"/);
assert.match(app,/data-toggle-today-tools="\$\{q\.id\}"/);
assert.match(app,/function toggleTodayCardTools\(/);
assert.match(app,/data-complete="\$\{q\.id\}"[^>]*>\+1 again<\/button>/);
assert.match(app,/class="tile-undo" data-undo-completion/);
assert.match(app,/Ridge \$\{ridgeIndex\}/);

assert.match(html,/styles\.css\?v=48/);
assert.match(serviceWorker,/level90-v48/);
assert.match(readme,/## Version 48 Ascension Quest Cards/);

console.log("Level90 Version 48 Ascension Quest Card tests passed");
