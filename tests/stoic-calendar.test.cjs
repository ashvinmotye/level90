"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const cloud = fs.readFileSync(path.join(root,"cloud.js"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const migration = fs.readFileSync(path.join(root,"supabase","migrations","20260827_add_level90_stoic_calendar.sql"),"utf8");
const reminderMigration = fs.readFileSync(path.join(root,"supabase","migrations","20260903_add_level90_stoic_reflection_reminder.sql"),"utf8");

for (const id of [
  "stoicCalendarGrid","stoicSetupDialog","stoicLifeDialog","stoicShowLifeBtn",
  "stoicYearWeekGrid","stoicWeekDetail"
]) assert.match(html,new RegExp(`id="${id}"`),`missing ${id}`);

assert.match(html,/MEMENTO MORI/);
assert.match(html,/>Show Life</);
assert.doesNotMatch(html,/>Open review</i);
assert.match(html,/planning horizon, not a prediction of lifespan/i);
assert.ok(html.indexOf('id="stoicWeekDetail"') < html.indexOf('id="view-settings"'),"selected-week questions should render directly inside Character");
assert.match(html,/styles\.css\?v=43/);
assert.match(app,/const STOIC_DEFAULT_HORIZON = 90/);
assert.match(app,/Array\.from\(\{length:52\}/);
assert.match(app,/function renderStoicYearView\(\)/);
assert.match(app,/function openStoicLifeDialog\(\)/);
assert.match(app,/function selectStoicYear\(/);
assert.match(app,/dailyScoreFor\(date\)/,"calendar should reuse the recurring-only daily score");
assert.match(app,/metrics\?\.strongDays>=4/,"deliberate weeks should come from 80+ score days");
assert.doesNotMatch(app,/saveStoicWeekField[\s\S]{0,1200}xpForQuest/,"Stoic reflections must not award XP");
assert.match(css,/\.stoic-week-cell\.current/);
assert.match(css,/\.stoic-week-cell\.future/);
assert.match(cloud,/stoic_calendar:record\.stoicCalendar/);
assert.match(cloud,/schema_version, stoic_calendar/);
assert.match(migration,/add column if not exists stoic_calendar jsonb/);
assert.match(html,/id="stoicReflectionToggle"/);
assert.match(html,/id="stoicReflectionTime"[^>]*value="19:00"/);
assert.match(reminderMigration,/add column if not exists stoic_reflection_enabled boolean not null default true/);
assert.match(reminderMigration,/stoic_reflection/);
assert.match(serviceWorker,/level90-v43/);

console.log("Level90 Stoic Calendar tests passed");
