"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const renderer = app.match(/function renderHistoryCalendar\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(renderer,"History calendar renderer must exist");

const today = "2026-09-18";
const scores = {"2026-09-16":90,"2026-09-17":55,[today]:45};
const activity = {"2026-09-16":1,"2026-09-17":1,[today]:1};
const elements = Object.fromEntries([
  "#historyMonthLabel","#historyCalendar","#previousMonthBtn","#nextMonthBtn"
].map(id=>[id,{}]));
const key = date=>date
  ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`
  : today;
const parse = value=>{const [year,month,day]=value.split("-").map(Number);return new Date(year,month-1,day);};

const context = {
  Date,Intl,
  historyMonth:new Date(2026,8,1),
  selectedHistoryDate:"2026-09-17",
  state:{startedOn:"2026-09-01"},
  localDateKey:key,
  parseLocalDate:parse,
  dailyScoreFor:date=>scores[key(date)] || 0,
  completedXpForDate:date=>activity[key(date)] || 0,
  $:selector=>elements[selector]
};
vm.runInNewContext(`${renderer}\nrenderHistoryCalendar();`,context);

function classesFor(date) {
  const markup=elements["#historyCalendar"].innerHTML;
  const matches=[...markup.matchAll(/<button class="calendar-day ([^"]*)" data-history-date="([^"]+)"/g)];
  return matches.find(([,classes,key])=>key===date)?.[1].split(" ") || [];
}

assert.ok(classesFor("2026-09-16").includes("done"),"past 80+ day remains green");
assert.ok(classesFor("2026-09-17").includes("below-target"),"past below-80 day has its own status");
assert.ok(!classesFor("2026-09-17").includes("partial"),"past days are never in progress");
assert.ok(classesFor(today).includes("partial"),"today below 80 with activity is in progress");
assert.ok(classesFor("2026-09-15").includes("empty"),"day without activity stays neutral");

activity[today]=0;
vm.runInNewContext("renderHistoryCalendar();",context);
assert.ok(classesFor(today).includes("empty"),"today without activity has no progress state");

activity[today]=1;
scores[today]=90;
vm.runInNewContext("renderHistoryCalendar();",context);
assert.ok(classesFor(today).includes("done"),"today at 80+ uses the strong status");

console.log("Level90 history calendar status tests passed");
