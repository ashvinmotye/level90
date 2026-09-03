"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));

function pngDimensions(fileName){
  const png = fs.readFileSync(path.join(root,"icons",fileName));
  assert.equal(png.toString("ascii",1,4),"PNG",`${fileName} must be a PNG`);
  return [png.readUInt32BE(16),png.readUInt32BE(20)];
}

const appIconSizes = new Map([
  ["icon-source.png",[2048,2048]],
  ["icon-master.png",[1024,1024]],
  ["icon-512.png",[512,512]],
  ["icon-192.png",[192,192]],
  ["apple-touch-icon-v39.png",[180,180]],
  ["apple-touch-icon.png",[180,180]],
  ["favicon-32.png",[32,32]],
  ["icon-maskable-512.png",[512,512]],
  ["icon-maskable-192.png",[192,192]]
]);
for (const [fileName,expected] of appIconSizes) {
  assert.deepEqual(pngDimensions(fileName),expected,`${fileName} has the wrong dimensions`);
}

const appIconSource = fs.readFileSync(path.join(root,"icons","icon-source.png"));
assert.equal(
  crypto.createHash("sha256").update(appIconSource).digest("hex"),
  "11ec9ffa1763b9f894d642b6f3e244d022699f197de455494017d441a11e22b7",
  "the supplied Level90 source artwork must remain unchanged"
);
assert.match(html,/apple-touch-icon-v39\.png/,"iOS should request the current cache-busting Apple Touch icon filename");
assert.equal(manifest.background_color,"#193546","manifest background should match the supplied icon");
assert.ok(manifest.icons.some(icon=>icon.src === "./icons/icon-512.png" && icon.purpose === "any"),"manifest should include the standard Level90 icon");
assert.ok(manifest.icons.some(icon=>icon.src === "./icons/icon-maskable-512.png" && icon.purpose === "maskable"),"manifest should include the safe-zone Level90 icon");

const icons = ["notification","fire","rocket","import","export","reset","today","quest","history","character","moon","sun","reorder","categories","wave","plus","edit","active","paused","delete","drag"];
for (const icon of icons) assert.match(html,new RegExp(`id="icon-${icon}"`),`missing ${icon} symbol`);

const staticUses = ["notification","fire","rocket","import","export","reset","today","quest","history","character","moon","sun","reorder","categories","wave"];
for (const icon of staticUses) assert.match(html,new RegExp(`href="#icon-${icon}"`),`missing ${icon} interface use`);

assert.doesNotMatch(html,/(🔔|🔥|🚀|⬇️?|⬆️?|♻️?|⚔️?|📜|🗓️?|🧬)/u,"legacy interface emoji should be replaced by SVGs");
assert.doesNotMatch(html,/(👋|◫|↕️?)/u,"greeting and Quests action glyphs should be replaced by SVGs");
assert.match(app,/auraIcon\("fire","streak-icon"\)/,"Today and Quests streaks should use the fire symbol");
assert.doesNotMatch(app,/reorderBtn"\)\.textContent/,"Quests rendering must preserve the Reorder SVG");
assert.match(app,/reorderButton\.querySelector\("span"\)\.textContent/,"Quests rendering should update only the Reorder label");
assert.match(app,/data-drag-handle/,"Quests sorting should expose a direct drag handle");
assert.doesNotMatch(app,/data-move-id/,"Quests sorting should not use stepwise arrow buttons");
assert.match(css,/@media \(max-width: 520px\)[\s\S]*\.quest-card-action-label \{[^}]*clip-path:inset\(50%\)/,"mobile quest action labels should be visually hidden while remaining accessible");
assert.match(app,/class="tile-completion-count"/,"Today cards should render a repeat-clear count badge");
assert.match(app,/data-undo-completion/,"Today cards should retain a one-clear undo action");
assert.match(app,/isQuestVisibleInLibrary/,"completed one-off quests should use the library visibility rule");
assert.doesNotMatch(app,/quickToggle\.textContent/,"theme updates must preserve the inline sun and moon SVGs");
assert.match(css,/body\.light \.theme-icon-sun \{ display:none; \}/,"light mode should show the moon action");
assert.match(css,/\.nav-btn\.active \.nav-icon \{[^}]*color:var\(--accent-soft\)/,"active navigation icons should use the AuraOS accent");

console.log("Level90 AuraOS icon tests passed");
