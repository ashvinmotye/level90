"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const cloud = fs.readFileSync(path.join(root,"cloud.js"),"utf8");
const migration = fs.readFileSync(path.join(root,"supabase","migrations","20260903_add_level90_level_fonts.sql"),"utf8");

assert.match(html,/family=Inter[^"\n]+family=Rubik\+Doodle\+Shadow&amp;display=swap/);
assert.doesNotMatch(html,/data-level-font=/,"the fixed display face must not expose a font picker");
assert.doesNotMatch(html,/id="palettePicker"/,"the retired palette picker must not be rendered");
assert.doesNotMatch(html,/id="appearancePreviewLevel"/,"the retired appearance preview must not be rendered");
assert.match(css,/\.profile-greeting strong,[\s\S]*#levelUpNumber,[\s\S]*body\[data-level-font\] #levelNumber \{[\s\S]*font-family:"Rubik Doodle Shadow"/);
assert.match(css,/body\[data-level-font\] #levelNumber \{[\s\S]*background:none;[\s\S]*animation:none;/);

// Keep older synced profile values compatible even though the picker is retired.
assert.match(app,/const LEVEL_FONTS = \["default","moirai-one","rubik-lines","zen-tokyo-zoo"\]/);
assert.match(app,/document\.body\.dataset\.levelFont = state\.levelFont \|\| "default"/);
assert.match(cloud,/level_font:record\.levelFont/);
assert.match(cloud,/state\.levelFont = profile\.level_font \|\| "default"/);
assert.match(cloud,/palette, level_font, schema_version/);
assert.match(migration,/add column if not exists level_font text not null default 'default'/);

console.log("Level90 fixed display-font tests passed");
