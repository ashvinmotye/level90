"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");

function pngDimensions(fileName){
  const png = fs.readFileSync(path.join(root,"icons",fileName));
  assert.equal(png.toString("ascii",1,4),"PNG",`${fileName} must be a PNG`);
  return [png.readUInt32BE(16),png.readUInt32BE(20)];
}

const appIconSizes = new Map([
  ["icon-master.png",[1024,1024]],
  ["icon-512.png",[512,512]],
  ["icon-192.png",[192,192]],
  ["apple-touch-icon.png",[180,180]],
  ["favicon-32.png",[32,32]],
  ["icon-maskable-512.png",[512,512]],
  ["icon-maskable-192.png",[192,192]]
]);
for (const [fileName,expected] of appIconSizes) {
  assert.deepEqual(pngDimensions(fileName),expected,`${fileName} has the wrong dimensions`);
}

const appIconSource = fs.readFileSync(path.join(root,"icons","icon-source.svg"),"utf8");
assert.match(appIconSource,/Framework7 Icons/,"app icon source should retain the supplied SVG attribution");
assert.match(appIconSource,/translate\("?148 148\)? scale\("?13\)?/,"supplied refresh\/90 mark should remain centered");
for (const auraColor of ["#065b98","#1b7fdc","#087d95"]) {
  assert.match(appIconSource,new RegExp(auraColor,"i"),`app icon should use AuraOS color ${auraColor}`);
}

const icons = ["notification","fire","rocket","import","export","reset","today","quest","history","character","moon","sun","reorder","categories","wave"];
for (const icon of icons) assert.match(html,new RegExp(`id="icon-${icon}"`),`missing ${icon} symbol`);

const staticUses = ["notification","fire","rocket","import","export","reset","today","quest","history","character","moon","sun","reorder","categories","wave"];
for (const icon of staticUses) assert.match(html,new RegExp(`href="#icon-${icon}"`),`missing ${icon} interface use`);

assert.doesNotMatch(html,/(🔔|🔥|🚀|⬇️?|⬆️?|♻️?|⚔️?|📜|🗓️?|🧬)/u,"legacy interface emoji should be replaced by SVGs");
assert.doesNotMatch(html,/(👋|◫|↕️?)/u,"greeting and Quests action glyphs should be replaced by SVGs");
assert.match(app,/auraIcon\("fire","streak-icon"\)/,"Today and Quests streaks should use the fire symbol");
assert.doesNotMatch(app,/reorderBtn"\)\.textContent/,"Quests rendering must preserve the Reorder SVG");
assert.match(app,/reorderButton\.querySelector\("span"\)\.textContent/,"Quests rendering should update only the Reorder label");
assert.doesNotMatch(app,/quickToggle\.textContent/,"theme updates must preserve the inline sun and moon SVGs");
assert.match(css,/body\.light \.theme-icon-sun \{ display:none; \}/,"light mode should show the moon action");
assert.match(css,/\.nav-btn\.active \.nav-icon \{[^}]*color:var\(--accent-soft\)/,"active navigation icons should use the AuraOS accent");

console.log("Level90 AuraOS icon tests passed");
