"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

assert.match(html,/styles\.css\?v=61/);
assert.match(html,/app\.js\?v=61/);
assert.match(html,/id="view-today" class="view active"/);
assert.match(html,/id="headerLevelLabel">Level 1</);
assert.doesNotMatch(html,/id="ascentStage"/);
assert.doesNotMatch(html,/id="ascentRouteMap"/);
assert.doesNotMatch(html,/id="levelNumber"/);
assert.match(html,/id="dateLabel"[\s\S]*class="meta-separator"[^>]*>·<[\s\S]*id="journeyDayLabel"/);
assert.match(html,/id="dailyScore"[\s\S]*score[\s\S]*id="todayXp"[\s\S]*XP score today[\s\S]*id="momentumScore"[\s\S]*momentum/);

assert.match(app,/setMetricValue\("#headerLevelLabel",[^;]+p\.lvl/);
assert.match(app,/new Intl\.DateTimeFormat\("en-GB",\{weekday:"long",day:"numeric",month:"long"\}\)/);
assert.match(app,/#profileGreetingBtn"\)\.addEventListener\("click",\(\)=>showView\("today"/);

assert.match(css,/\/\* Version 56 · Sequential date-row alignment \*\//);
assert.match(css,/\.journey-meta\.minimal-meta \{[\s\S]*?display:flex;[\s\S]*?justify-content:flex-start;[\s\S]*?white-space:nowrap/);
assert.match(css,/\.journey-meta\.minimal-meta \.journey-day-group \{[\s\S]*?display:inline-flex;/);
assert.match(css,/\.today-overview \.home-stats \{[\s\S]*?display:flex;[\s\S]*?flex-wrap:nowrap;[\s\S]*?white-space:nowrap/);
assert.match(css,/#completedTodayQuests \.quest-card\.today-tile \{[\s\S]*?padding-right:18px;[\s\S]*?padding-left:18px/);
assert.match(css,/@media \(min-width:900px\) \{[\s\S]*?max-width:960px;[\s\S]*?\.topbar \{[\s\S]*?min-height:92px;[\s\S]*?\.profile-greeting strong \{[\s\S]*?font-size:2rem;[\s\S]*?\.topbar \.icon-btn \{[\s\S]*?width:44px;[\s\S]*?height:44px;/);
assert.match(css,/@media \(max-width:700px\) \{[\s\S]*?\.profile-greeting strong \{[\s\S]*?font-size:1\.72rem;/);
assert.match(serviceWorker,/const CACHE = "level90-v61";/);

console.log("Level90 Version 54 compact dashboard tests passed");
