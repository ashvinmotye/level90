"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

assert.match(html,/styles\.css\?v=53/);
assert.match(html,/app\.js\?v=53/);
assert.match(html,/id="view-today" class="view active"/);
assert.match(html,/id="ascentStage" class="ascent-stage"/);
assert.match(html,/id="levelNumber"/);

assert.match(css,/\.app-shell \{[\s\S]*?width:min\(100%,1040px\);[\s\S]*?max-width:1040px;[\s\S]*?padding:env\(safe-area-inset-top\) 68px/);
assert.match(css,/\.topbar \.icon-btn \{[\s\S]*?width:clamp\(48px,7\.2vw,76px\);[\s\S]*?height:clamp\(48px,7\.2vw,76px\)/);
assert.match(css,/\.ascent-stage \{[\s\S]*?width:100%;[\s\S]*?aspect-ratio:1000 \/ 520/);

const legacySelector = ".ascent-world .ascent-stage .level-orb {";
const desktopSelector = ".ascent-world .ascent-stage .level-display.level-orb {";
const legacyIndex = css.indexOf(legacySelector);
const desktopIndex = css.lastIndexOf(desktopSelector);
assert.ok(legacyIndex >= 0,"the retired rule should remain represented until legacy CSS is removed");
assert.ok(desktopIndex > legacyIndex,"the minimal desktop positioning rule must follow the legacy orb rule");

const classCount = selector => (selector.match(/\.[\w-]+/g) || []).length;
assert.ok(
  classCount(desktopSelector) > classCount(legacySelector),
  "the minimal level selector must outrank the legacy desktop selector"
);

const desktopRule = css.slice(desktopIndex,css.indexOf("}",desktopIndex)+1);
assert.match(desktopRule,/top:auto;/);
assert.match(desktopRule,/right:0;/);
assert.match(desktopRule,/bottom:1%;/);
assert.match(desktopRule,/left:auto;/);
assert.match(desktopRule,/width:67%;/);
assert.match(desktopRule,/height:94%;/);
assert.match(desktopRule,/transform:none;/);

assert.match(css,/@media \(min-width:900px\) \{[\s\S]*?\.today-layout \{\s*display:block;/);
assert.match(css,/@media \(max-width:700px\) \{[\s\S]*?\.topbar \.icon-btn \{\s*width:44px;\s*height:44px;/);
assert.match(serviceWorker,/const CACHE = "level90-v53";/);

console.log("Level90 Version 53 desktop layout tests passed");
