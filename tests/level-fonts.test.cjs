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

assert.match(html,/fonts\.googleapis\.com\/css2\?family=Moirai\+One&amp;family=Rubik\+Lines&amp;family=Zen\+Tokyo\+Zoo&amp;display=swap/);
const fontOptions = [...html.matchAll(/data-level-font="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(fontOptions,["default","moirai-one","rubik-lines","zen-tokyo-zoo"]);
assert.match(html,/Only changes the level number inside Today’s orb\./);

for (const family of ["Moirai One","Rubik Lines","Zen Tokyo Zoo"]) assert.match(css,new RegExp(`font-family:"${family}"`));
assert.match(css,/body\[data-level-font="moirai-one"\] #levelNumber/);
assert.match(css,/body\[data-level-font="rubik-lines"\] #levelNumber/);
assert.match(css,/body\[data-level-font="zen-tokyo-zoo"\] #levelNumber/);
assert.doesNotMatch(css,/body\[data-level-font=[^\n]+\.level-core/,"the selection must not affect Character's level display");

assert.match(app,/const LEVEL_FONTS = \["default","moirai-one","rubik-lines","zen-tokyo-zoo"\]/);
assert.match(app,/document\.body\.dataset\.levelFont = state\.levelFont \|\| "default"/);
assert.match(cloud,/level_font:record\.levelFont/);
assert.match(cloud,/state\.levelFont = profile\.level_font \|\| "default"/);
assert.match(cloud,/palette, level_font, schema_version/);
assert.match(migration,/add column if not exists level_font text not null default 'default'/);
assert.match(migration,/check \(level_font in \('default', 'moirai-one', 'rubik-lines', 'zen-tokyo-zoo'\)\)/);

console.log("Level90 level-font tests passed");
