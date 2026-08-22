"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname,"..");

function fakeElement() {
  return {
    hidden:false,disabled:false,textContent:"",value:"",open:false,
    validity:{valid:true},lastChild:{textContent:""},dataset:{},style:{setProperty(){}},
    classList:{toggle(){},add(){},remove(){},contains(){ return false; }},
    addEventListener(){},setAttribute(){},focus(){},close(){},showModal(){}
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem:key=>values.has(key) ? values.get(key) : null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    clear:()=>values.clear()
  };
}

function baseContext() {
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
  const context = {
    console,structuredClone,document,localStorage:memoryStorage(),
    navigator:{onLine:true,vibrate(){},serviceWorker:null},
    window:{location:{href:"https://level90.example/"},setTimeout(){ return 1; },clearTimeout(){},addEventListener(){},confirm(){ return true; }},
    getComputedStyle(){ return {getPropertyValue(){ return ""; }}; },
    setTimeout(){ return 1; },clearTimeout(){},URL,Blob,Intl,Date,Math,JSON,Map,Set,Promise
  };
  context.window.document = document;
  return vm.createContext(context);
}

function runAppStateTests() {
  const context = baseContext();
  const source = fs.readFileSync(path.join(root,"app.js"),"utf8").replace(/\nbootstrap\(\);\s*$/,"\n");
  vm.runInContext(`${source}
    CONFIG = {
      app:{maxLevel:90},
      difficulty:{tiny:{xp:5},easy:{xp:10},medium:{xp:20},hard:{xp:40},major:{xp:75},epic:{xp:100}},
      categories:[{id:"body",name:"Body",icon:"💪",description:""}],
      quests:[]
    };
    state = {
      schemaVersion:1,startedOn:"2026-08-17",theme:"dark",palette:"arctic",profileName:"",
      categories:[{id:"body",name:"Body",icon:"💪",description:""}],
      quests:[{id:"q_daily",title:"Daily quest",categoryId:"body",difficulty:"hard",type:"recurring",schedule:{mode:"daily"},active:true,createdOn:"2026-08-17"}],
      completions:{
        "2026-08-17":{q_daily:true},
        "2026-08-18":{q_daily:"2026-08-18T08:00:00.000Z"},
        "2026-08-19":{q_daily:{completedAt:"2026-08-19T08:00:00.000Z",difficulty:"invalid"}},
        "2026-08-20":{q_daily:true},
        "2026-08-21":{q_daily:true}
      }
    };
    migrateState();
    globalThis.stateTestResult = {
      schemaVersion:state.schemaVersion,
      legacyXp:state.completions["2026-08-17"].q_daily.xpAwarded,
      invalidDifficulty:state.completions["2026-08-19"].q_daily.difficulty,
      invalidDifficultyXp:state.completions["2026-08-19"].q_daily.xpAwarded,
      streak:questStreak(state.quests[0],parseLocalDate("2026-08-22"))
    };
    state.completions = {"2026-08-22":{q_deleted:{completedAt:"2026-08-22T08:00:00.000Z",questTitle:"Archived quest",categoryId:"body",difficulty:"hard",xpAwarded:40}}};
    state.quests = [];
    globalThis.deletedHistoryResult = {
      totalXp:totalXp(),dayXp:completedXpForDate(parseLocalDate("2026-08-22")),
      title:historicalQuestFromCompletion("q_deleted","2026-08-22").title
    };
  `,context);

  assert.deepEqual({...context.stateTestResult.streak},{current:5,best:5});
  assert.equal(context.stateTestResult.schemaVersion,3);
  assert.equal(context.stateTestResult.legacyXp,40);
  assert.equal(context.stateTestResult.invalidDifficulty,"easy");
  assert.equal(context.stateTestResult.invalidDifficultyXp,10);
  assert.deepEqual({...context.deletedHistoryResult},{totalXp:40,dayXp:40,title:"Archived quest"});
}

async function runCloudTests() {
  const context = baseContext();
  Object.assign(context,{
    CONFIG:{
      difficulty:{tiny:{xp:5},easy:{xp:10},medium:{xp:20},hard:{xp:40},major:{xp:75},epic:{xp:100}},
      categories:[],quests:[]
    },
    state:{schemaVersion:3,startedOn:"2026-08-17",profileName:"Ashvin",theme:"dark",palette:"arctic",categories:[],quests:[],completions:{}},
    localDateKey:()=>"2026-08-22",
    normalizeCompletionRecord:(value,quest)=>({
      completedAt:value.completedAt,questTitle:value.questTitle || quest?.title || "Deleted quest",
      categoryId:value.categoryId || quest?.categoryId || "",difficulty:value.difficulty || quest?.difficulty || "easy",
      xpAwarded:Number(value.xpAwarded) || 0
    }),
    migrateState(){},save(){},renderAll(){},showToast(){},requestNameIfNeeded(){}
  });
  const source = fs.readFileSync(path.join(root,"cloud.js"),"utf8");
  vm.runInContext(`${source}
    level90AuthSession = {user:{id:"user-a",email:"ashvin@example.com"}};
    level90ActiveUserId = "user-a";
    globalThis.cloudApi = {
      queueLevel90StateChanges,level90LoadSyncQueue,level90ProcessSyncQueue,level90ApplyCloudSnapshot,
      setClient(client){ level90AuthClient = client; }
    };
  `,context);

  const questA = {id:"q_a",title:"Quest A",categoryId:"body",difficulty:"easy",type:"recurring",schedule:{mode:"daily"},active:true,createdOn:"2026-08-17",createdAt:"2026-08-17T00:00:00.000Z"};
  const questB = {...questA,id:"q_b",title:"Quest B"};
  const base = {schemaVersion:3,startedOn:"2026-08-17",profileName:"Ashvin",theme:"dark",palette:"arctic",categories:[],quests:[questA,questB],completions:{}};
  const completed = structuredClone(base);
  completed.completions = {"2026-08-22":{q_a:{completedAt:"2026-08-22T08:00:00.000Z",questTitle:"Quest A",categoryId:"body",difficulty:"easy",xpAwarded:10}}};
  context.state = completed;

  context.cloudApi.queueLevel90StateChanges(base,completed);
  let completionOps = context.cloudApi.level90LoadSyncQueue().filter(item=>item.entity === "completion");
  assert.equal(completionOps.length,1);
  assert.equal(completionOps[0].deletedAt,null);

  context.cloudApi.queueLevel90StateChanges(completed,base);
  completionOps = context.cloudApi.level90LoadSyncQueue().filter(item=>item.entity === "completion");
  assert.equal(completionOps.length,1,"undo should replace the pending completion operation");
  assert.ok(completionOps[0].deletedAt);

  context.cloudApi.queueLevel90StateChanges(base,completed);
  completionOps = context.cloudApi.level90LoadSyncQueue().filter(item=>item.entity === "completion");
  assert.equal(completionOps.length,1,"re-completion should remain compacted");
  assert.equal(completionOps[0].deletedAt,null);

  const reordered = structuredClone(base);
  reordered.quests.reverse();
  context.cloudApi.queueLevel90StateChanges(base,reordered);
  const questOps = context.cloudApi.level90LoadSyncQueue().filter(item=>item.entity === "quest");
  assert.deepEqual(questOps.map(item=>[item.id,item.sortOrder]).sort(),[["q_a",1],["q_b",0]]);

  const writes = [];
  context.cloudApi.setClient({
    from(table) { return {async upsert(row,options) { writes.push({table,row,options}); return {error:null}; }}; }
  });
  await context.cloudApi.level90ProcessSyncQueue();
  assert.equal(context.cloudApi.level90LoadSyncQueue().length,0);
  assert.ok(writes.some(write=>write.table === "level90_completions" && write.options.onConflict === "user_id,id"));
  assert.ok(writes.filter(write=>write.table === "level90_quests").every(write=>write.options.onConflict === "user_id,id"));

  context.state = {
    ...structuredClone(base),
    categories:[{id:"body",name:"Local Body",icon:"💪",description:"",createdAt:"2026-08-17T00:00:00.000Z"}],
    quests:[questA],
    completions:{"2026-08-22":{q_a:{completedAt:"2026-08-22T08:00:00.000Z",questTitle:"Local Quest A",categoryId:"body",difficulty:"easy",xpAwarded:10}}}
  };
  const snapshot = {
    profile:[],
    categories:[
      {id:"body",name:"Remote Body",icon:"🌐",description:"",sort_order:0,client_created_at:"2026-08-17T00:00:00.000Z",deleted_at:null},
      {id:"remote",name:"Remote only",icon:"☁️",description:"",sort_order:1,client_created_at:"2026-08-17T00:00:00.000Z",deleted_at:null}
    ],
    quests:[
      {id:"q_a",title:"Remote Quest A",category_id:"body",difficulty:"hard",quest_type:"recurring",schedule:{mode:"daily"},active:true,sort_order:0,created_on:"2026-08-17",client_created_at:"2026-08-17T00:00:00.000Z",deleted_at:null},
      {id:"q_remote",title:"Remote Quest",category_id:"remote",difficulty:"easy",quest_type:"recurring",schedule:{mode:"daily"},active:true,sort_order:1,created_on:"2026-08-17",client_created_at:"2026-08-17T00:00:00.000Z",deleted_at:null}
    ],
    completions:[
      {id:"2026-08-22:q_a",quest_id:"q_a",completion_date:"2026-08-22",completed_at:"2026-08-22T10:00:00.000Z",quest_title:"Remote Quest A",category_id:"body",difficulty:"hard",xp_awarded:40,deleted_at:null},
      {id:"2026-08-22:q_remote",quest_id:"q_remote",completion_date:"2026-08-22",completed_at:"2026-08-22T10:00:00.000Z",quest_title:"Remote Quest",category_id:"remote",difficulty:"easy",xp_awarded:10,deleted_at:null}
    ]
  };
  context.cloudApi.level90ApplyCloudSnapshot(snapshot,{protectLocal:true});
  assert.equal(context.state.categories[0].name,"Local Body");
  assert.equal(context.state.quests[0].title,"Quest A");
  assert.equal(context.state.completions["2026-08-22"].q_a.xpAwarded,10);
  assert.ok(context.state.quests.some(quest=>quest.id === "q_remote"));
  assert.equal(context.state.completions["2026-08-22"].q_remote.xpAwarded,10);

  context.cloudApi.level90ApplyCloudSnapshot({
    profile:[],categories:snapshot.categories,
    quests:[{...snapshot.quests[0],deleted_at:"2026-08-22T12:00:00.000Z"},snapshot.quests[1]],
    completions:[{...snapshot.completions[0],deleted_at:"2026-08-22T12:00:00.000Z"},snapshot.completions[1]]
  },{protectLocal:false});
  assert.ok(!context.state.quests.some(quest=>quest.id === "q_a"));
  assert.ok(!context.state.completions["2026-08-22"].q_a);
}

(async()=>{
  runAppStateTests();
  await runCloudTests();
  console.log("Level90 state and sync tests passed");
})().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
