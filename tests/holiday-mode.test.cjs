"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const migration = fs.readFileSync(path.join(root,"supabase","migrations","20261010_add_level90_holiday_mode.sql"),"utf8");

assert.match(html,/id="holidayModeToggle" type="checkbox" role="switch"/);
assert.match(html,/id="holidayModeBanner" class="holiday-mode-banner" hidden/);
assert.match(html,/Skipped holiday quests will not break streaks or lower consistency/);
assert.match(css,/\/\* Version 67 · Holiday mode\. \*\//);
assert.match(css,/\.holiday-mode-toggle input:checked/);
assert.match(migration,/add column if not exists holiday_mode jsonb not null/);
assert.match(migration,/"enabled":false,"activeFrom":null,"periods":\[\]/);

function fakeElement() {
  return {
    hidden:false,disabled:false,textContent:"",value:"",checked:false,open:false,
    validity:{valid:true},lastChild:{textContent:""},dataset:{},style:{setProperty(){}},
    classList:{toggle(){},add(){},remove(){},contains(){ return false; }},
    addEventListener(){},setAttribute(){},focus(){},click(){},close(){},showModal(){}
  };
}

const elements = new Map();
const document = {
  body:fakeElement(),visibilityState:"visible",
  querySelector(selector) {
    if (selector === "meta[name='theme-color']" || selector === "#themeBtn") return null;
    if (!elements.has(selector)) elements.set(selector,fakeElement());
    return elements.get(selector);
  },
  querySelectorAll(){ return []; },
  addEventListener(){},createElement(){ return fakeElement(); }
};
const storage = new Map();
const context = vm.createContext({
  console,structuredClone,document,
  localStorage:{getItem:key=>storage.get(key) || null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  navigator:{onLine:true,vibrate(){},serviceWorker:null},
  window:{location:{href:"https://level90.example/"},setTimeout(){ return 1; },clearTimeout(){},addEventListener(){}},
  getComputedStyle(){ return {getPropertyValue(){ return ""; }}; },
  setTimeout(){ return 1; },clearTimeout(){},URL,Blob,Intl,Date,Math,JSON,Map,Set,Promise
});
context.window.document = document;

const source = fs.readFileSync(path.join(root,"app.js"),"utf8").replace(/\nbootstrap\(\);\s*$/,"\n");
vm.runInContext(`${source}
  CONFIG={
    app:{maxLevel:90},
    difficulty:{easy:{xp:10},hard:{xp:40}},
    categories:[{id:"body",name:"Body",icon:"",description:""}],quests:[]
  };
  const daily={id:"q_daily",title:"Daily",categoryId:"body",difficulty:"hard",type:"recurring",schedule:{mode:"daily"},active:true,createdOn:"2026-08-17"};
  const monday={id:"q_monday",title:"Monday",categoryId:"body",difficulty:"easy",type:"recurring",schedule:{mode:"weekdays",days:[1]},active:true,createdOn:"2026-08-17"};
  const oneoff={id:"q_once",title:"One off",categoryId:"body",difficulty:"easy",type:"oneoff",schedule:{mode:"once"},active:true,createdOn:"2026-08-17"};
  state={
    schemaVersion:8,startedOn:"2026-08-17",theme:"dark",palette:"arctic",levelFont:"default",profileName:"",
    holidayMode:{enabled:true,activeFrom:"2026-08-19",periods:[]},stoicCalendar:freshStoicCalendar(),
    categories:structuredClone(CONFIG.categories),quests:[daily,monday,oneoff],completions:{}
  };
  ["2026-08-17","2026-08-18","2026-08-22"].forEach(dateKey=>{
    state.completions[dateKey]={q_daily:normalizeCompletionRecord({completedAt:completionFallbackTimestamp(dateKey)},daily,dateKey)};
  });
  migrateState();
  const holidayDate=parseLocalDate("2026-08-22");
  globalThis.beforeHolidayOff={
    schemaVersion:state.schemaVersion,
    planned:plannedQuestsFor(holidayDate).map(quest=>quest.id),
    optional:optionalQuestsFor(holidayDate).map(quest=>quest.id),
    streak:questStreak(daily,holidayDate),
    consistency:questConsistency(daily,holidayDate),
    score:dailyScoreFor(holidayDate),
    completionWasOptional:normalizeCompletionRecord({},daily,"2026-08-20").wasOptional
  };
  save=()=>{}; renderAll=()=>{}; showToast=()=>{};
  setHolidayMode(false,holidayDate);
  globalThis.afterHolidayOff={
    holidayMode:structuredClone(state.holidayMode),
    holidayRetained:isHolidayDate("2026-08-20"),
    todayRestored:!isHolidayDate("2026-08-22"),
    planned:plannedQuestsFor(holidayDate).map(quest=>quest.id),
    optional:optionalQuestsFor(holidayDate).map(quest=>quest.id),
    streak:questStreak(daily,holidayDate),
    consistency:questConsistency(daily,holidayDate)
  };
`,context);

assert.deepEqual(JSON.parse(JSON.stringify(context.beforeHolidayOff)),{
  schemaVersion:9,
  planned:[],optional:["q_daily","q_monday","q_once"],
  streak:{current:2,best:2},consistency:{completed:2,scheduled:2,percentage:100},
  score:0,completionWasOptional:true
});
assert.deepEqual(JSON.parse(JSON.stringify(context.afterHolidayOff)),{
  holidayMode:{enabled:false,activeFrom:null,periods:[{start:"2026-08-19",end:"2026-08-21"}]},
  holidayRetained:true,todayRestored:true,
  planned:["q_daily","q_once"],optional:[],
  streak:{current:3,best:3},consistency:{completed:3,scheduled:3,percentage:100}
});

console.log("Level90 Holiday mode tests passed");
