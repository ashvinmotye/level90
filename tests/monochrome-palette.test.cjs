"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");

assert.match(css,/Version 59 · Monochrome palette refresh/);
assert.match(css,/--bg:#191919;[\s\S]*--text:#fff;[\s\S]*--muted:rgb\(255 255 255 \/ \.62\);/);
assert.match(css,/body\.light,[\s\S]*--bg:#fff;[\s\S]*--text:#191919;[\s\S]*--muted:rgb\(25 25 25 \/ \.62\);/);
assert.match(css,/--minimal-action:#fff;[\s\S]*--minimal-action-text:#191919;/);
assert.match(css,/--minimal-action:#191919;[\s\S]*--minimal-action-text:#fff;/);

const interfaceCss = css.split("/* Version 60 · Score and week strength scale */")[0];
const hexColors = [...interfaceCss.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(match=>match[0].toLowerCase());
assert.deepEqual([...new Set(hexColors)].sort(),["#191919","#fff"],"general interface colors stay monochrome");
assert.match(css,/--score-strong:#15803d;/);
assert.match(css,/--score-progress:#b45309;/);
assert.match(css,/--week-moderate:#2563eb;/);
assert.doesNotMatch(css,/rgb\(255 118 146|rgba\(255,209,102|rgba\(3,7,18/,"legacy coloured accents must be removed");

console.log("Level90 Version 59 monochrome palette tests passed");
