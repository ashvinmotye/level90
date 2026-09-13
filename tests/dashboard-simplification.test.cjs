"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const readme = fs.readFileSync(path.join(root,"README.md"),"utf8");

const todayMarkup = html.match(/<section id="view-today"[\s\S]*?<\/section>\s*<section id="view-quests"/)?.[0] || "";
assert.ok(todayMarkup,"Today markup should be present");
assert.doesNotMatch(todayMarkup,/ridge|ascent|levelNumber|levelOrb/i,"Today must not render the retired ridge or level-number section");
assert.match(todayMarkup,/class="mock-home today-overview"/);
assert.match(todayMarkup,/class="journey-meta minimal-meta"/);
assert.match(todayMarkup,/class="home-stats"/);

assert.doesNotMatch(app,/renderAscentRidge\(p\.lvl/,"header rendering must not invoke the retired ridge");
assert.match(app,/const targetElement = \$\("#profileGreetingBtn"\)/,"XP feedback should now target the header level");
assert.match(css,/\.today-overview \{/);
assert.match(readme,/## Version 54 Compact Dashboard and Notification Read States/);

console.log("Level90 Version 54 dashboard simplification tests passed");
