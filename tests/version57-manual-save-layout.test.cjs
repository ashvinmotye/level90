"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const worker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

assert.match(html,/id="icon-settings" viewBox="0 0 36 36"/);
assert.match(html,/id="menuBtn"[\s\S]{0,220}<use href="#icon-settings">/);
assert.doesNotMatch(html,/id="closeSettings"|id="closeNotifications"/);
assert.doesNotMatch(html,/class="settings-page-head|class="page-heading settings-page-title/);

assert.match(app,/id="saveStoicWeekButton"[\s\S]{0,100}>Save</);
assert.match(app,/function saveStoicWeekReflection\(\)[\s\S]{0,900}save\(\)/);
assert.match(app,/addEventListener\("input",[\s\S]{0,260}setStoicSaveState\("unsaved"\)/);
assert.match(app,/addEventListener\("click",[\s\S]{0,180}saveStoicWeekReflection\(\)/);
assert.doesNotMatch(app,/scheduleStoicWeekSave|flushStoicWeekSave|stoicSaveTimer|pendingStoicSave/);

assert.match(css,/\.stoic-week-actions \{[^}]*justify-content:flex-end/);
assert.match(css,/\.auth-screen \{\s*place-items:center;\s*padding:calc\(24px \+ env\(safe-area-inset-top\)\)/);
assert.match(css,/\.auth-card \{[\s\S]{0,320}margin-inline:auto;[\s\S]{0,80}text-align:center;/);
assert.match(worker,/const CACHE = "level90-v61";/);

console.log("Level90 Version 59 manual-save and layout tests passed");
