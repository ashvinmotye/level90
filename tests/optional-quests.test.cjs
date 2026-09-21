"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const cloud=fs.readFileSync(path.join(root,"cloud.js"),"utf8");
const edge=fs.readFileSync(path.join(root,"supabase/functions/level90-notifications/index.ts"),"utf8");

const availableIndex=html.indexOf('id="availableQuests"');
const optionalIndex=html.indexOf('id="optionalTodaySection"');
const completedIndex=html.indexOf('id="completedTodaySection"');
assert.ok(availableIndex>=0 && availableIndex<optionalIndex && optionalIndex<completedIndex,"Optional today must sit between available and completed sections");
assert.match(html,/id="optionalQuestField" class="optional-quest-field hidden"/);
assert.match(html,/id="optionalQuestToggle" type="checkbox" role="switch"/);

assert.match(app,/const eligible=type==="recurring" && schedule==="weekdays";/,"optional control is limited to non-daily recurring quests");
assert.match(app,/schedule: mode==="weekdays" \? \{mode,days,\.\.\.\(\$\("#optionalQuestToggle"\)\.checked \? \{optional:true\} : \{\}\)\}/);
assert.match(app,/function isOptionalQuestOn\(/);
assert.match(app,/const optional = optionalQuestsFor\(today\);/);
assert.match(app,/questCard\(q,true,key,\{optional:true\}\)/);
assert.doesNotMatch(app,/Math\.min\(100,Math\.round\(\(completedScoreXpForDate/,"optional score must be allowed above 100");

assert.match(cloud,/schedule:record\.schedule/,"the optional flag syncs inside the existing schedule JSON");
assert.match(edge,/schedule:\{mode\?:string;days\?:number\[\];optional\?:boolean\}/);
assert.match(edge,/function questOptionalOn\(/);
assert.match(edge,/smartRuleVersion:4/);

console.log("Level90 optional quest UI and persistence tests passed");
