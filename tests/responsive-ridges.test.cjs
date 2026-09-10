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
assert.match(html,/id="ascentRouteMap"[^>]*viewBox="0 0 1000 520"[^>]*preserveAspectRatio="xMidYMid meet"/);
assert.doesNotMatch(html,/id="ascentHistoryRidges"/);
assert.match(html,/id="ascentRouteBase"/);
assert.match(html,/id="ascentRouteProgress"[^>]*pathLength="100"/);
assert.equal((html.match(/class="ascent-waypoint /g) || []).length,2,"the active ridge must have exactly two visible points");
assert.doesNotMatch(html,/class="ascent-terrain"/);

assert.match(css,/\/\* Version 51 · Minimal Level90 \*\//);
assert.match(css,/\.ascent-stage \{[\s\S]*?aspect-ratio:1000 \/ 520/);
assert.match(css,/\.ascent-route-map \{[\s\S]*?position:absolute[\s\S]*?inset:0[\s\S]*?width:100%;[\s\S]*?height:100%/);
assert.match(css,/\.ascent-world \.ascent-stage \.level-display\.level-orb \{[\s\S]*?position:absolute[\s\S]*?right:0[\s\S]*?bottom:1%/);
assert.match(css,/\.ascent-route-progress\.route-resetting \{\s*transition:none;/);
assert.match(css,/\.ascent-route-progress \{[\s\S]*?stroke:var\(--text\)[\s\S]*?stroke-dasharray:0 100/);

assert.doesNotMatch(app,/ASCENT_RIDGES/,"no reference to the retired ridge preset array may remain");
assert.match(app,/function ascentRidgeForLevel\(/);
assert.match(app,/function renderAscentRidge\(/);
assert.doesNotMatch(app,/history\.innerHTML=Array\.from/);
assert.match(app,/route\.style\.strokeDasharray=`\$\{routeProgress\} 100`/);
assert.match(app,/Math\.max\(0,Math\.min\(100,Math\.round\(progress\)\)\)/);
assert.match(app,/function animateRouteToSummit\(/);
assert.match(app,/route\.style\.strokeDasharray="100 100"/);
assert.match(app,/animateRouteToSummit\(\)\.then\(renderCompletedState\)/);

const ridgeFunctionSource = app.match(/function ascentRidgeForLevel\(level\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(ridgeFunctionSource,"ridge generator should be extractable");
const ascentRidgeForLevel = Function(`return (${ridgeFunctionSource})`)();
const generated = Array.from({length:90},(_,index)=>ascentRidgeForLevel(index+1));
assert.equal(new Set(generated.map(ridge=>ridge.path)).size,90,"every level from 1–90 must have a distinct ridge shape");
assert.ok(generated.every(ridge=>ridge.waypoints.length===2),"every ridge must expose exactly two endpoint points");

const renderFunctionSource = app.match(/function renderAscentRidge\(level,progress,\{maxed=false\}=\{\}\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(renderFunctionSource,"ridge renderer should be extractable");
const attributes = new Map();
const makeNode = () => ({
  classList:{add(){},remove(){}},
  dataset:{},
  style:{strokeDasharray:"",setProperty(){}},
  getAttribute(name){ return attributes.get(name) || ""; },
  setAttribute(name,value){ attributes.set(name,String(value)); }
});
const nodes = new Map([
  ["#ascentRouteBase",makeNode()],
  ["#ascentRouteProgress",makeNode()],
  ["#ascentWorld",makeNode()],
  ["#ascentStage",makeNode()],
  ["#ascentRouteMap",makeNode()]
]);
const waypoints=[makeNode(),makeNode()];
const renderAscentRidge = Function("$","$$","requestAnimationFrame","ascentRidgeForLevel",`return (${renderFunctionSource})`)(
  selector=>nodes.get(selector) || null,
  selector=>selector === ".ascent-waypoint" ? waypoints : [],
  callback=>callback(),
  ascentRidgeForLevel
);
assert.doesNotThrow(()=>renderAscentRidge(14,68),"the ridge renderer must execute without retired globals");
assert.equal(nodes.get("#ascentRouteProgress").style.strokeDasharray,"68 100");
assert.equal(nodes.get("#ascentStage").getAttribute("aria-valuenow"),"68");

assert.match(serviceWorker,/level90-v53/);
assert.match(readme,/## Version 53 Desktop Layout Repair/);
assert.match(readme,/## Version 52 Runtime Repair/);
assert.match(readme,/## Version 51 Minimal Level90/);

console.log("Level90 Version 53 ridge runtime tests passed");
