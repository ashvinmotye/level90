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

assert.match(css,/\/\* Version 49 · Direct Actions and Interface Consistency \*\//);
assert.match(css,/\/\* Version 48 · Ascension Quest Cards \*\//);
assert.match(css,/\.today-quest-grid \{ grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/\.quest-card\.today-tile \{[\s\S]*?grid-template-columns:64px minmax\(0,1fr\) auto/);
assert.match(css,/\.today-completion-medallion/);
assert.match(css,/\.tile-completion-count \{[\s\S]*?position:absolute; right:-4px; bottom:-3px/);
assert.match(css,/@media \(max-width: 520px\)[\s\S]*?\.today-quest-grid \{ grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/\.today-completion-mark::before \{[\s\S]*?left:6px; top:-3px/);
assert.match(css,/\.tile-count-actions \{ display:flex/);
assert.match(css,/\.tile-decrement-action,\.tile-repeat-action \{[\s\S]*?width:44px; height:44px/);
assert.match(css,/\.filter-row \{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(css,/#clearAllNotificationsButton \{[\s\S]*?background:rgb\(255 118 146 \/ \.1\)/);
assert.match(css,/\.notification-clear-btn \{[\s\S]*?background:rgb\(255 118 146 \/ \.09\)/);

assert.match(app,/class="today-completion-medallion \$\{done \? "is-complete" : ""\}"/);
assert.match(app,/\$\{done \? `data-undo-completion="\$\{q\.id\}"` : `data-complete="\$\{q\.id\}"`\}/);
assert.match(app,/class="tile-decrement-action" data-undo-completion/);
assert.match(app,/class="tile-repeat-action" data-complete/);
assert.doesNotMatch(app,/data-toggle-today-tools/);
assert.doesNotMatch(app,/function toggleTodayCardTools\(/);
assert.match(app,/Ridge \$\{ridgeIndex\}/);

assert.match(html,/styles\.css\?v=49/);
assert.match(serviceWorker,/level90-v49/);
assert.match(readme,/## Version 49 Direct Actions and Interface Consistency/);

console.log("Level90 Version 49 UI action tests passed");
