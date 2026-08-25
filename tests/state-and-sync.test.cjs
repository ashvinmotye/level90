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
    addEventListener(){},setAttribute(){},focus(){},click(){},close(){},showModal(){}
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
      streak:questStreak(state.quests[0],parseLocalDate("2026-08-22")),
      consistency:questConsistency(state.quests[0],parseLocalDate("2026-08-22"))
    };
    globalThis.questCardHtml = questCard(state.quests[0],false,"2026-08-22");
    const weekdayQuest = {id:"q_weekday",title:"Weekday quest",categoryId:"body",difficulty:"easy",type:"recurring",schedule:{mode:"weekdays",days:[1,2,3,4,5]},active:true,createdOn:"2026-08-17"};
    ["2026-08-17","2026-08-18","2026-08-19","2026-08-20"].forEach(dateKey=>{ state.completions[dateKey].q_weekday = true; });
    globalThis.scheduleConsistencyResult = {
      weekday:questConsistency(weekdayQuest,parseLocalDate("2026-08-23")),
      oneoff:questConsistency({...weekdayQuest,id:"q_once",type:"oneoff"},parseLocalDate("2026-08-23"))
    };
    ["2026-08-17","2026-08-18","2026-08-19","2026-08-20"].forEach(dateKey=>{ delete state.completions[dateKey].q_weekday; });
    delete state.completions["2026-08-21"];
    const xpBeforeBackwardEdit = totalXp();
    const streakBeforeBackwardEdit = questStreak(state.quests[0],parseLocalDate("2026-08-22"));
    const consistencyBeforeBackwardEdit = questConsistency(state.quests[0],parseLocalDate("2026-08-22"));
    toggleQuestCompletionForDate("q_daily","2026-08-21",completionFallbackTimestamp("2026-08-21"));
    const backwardRecord = state.completions["2026-08-21"].q_daily;
    globalThis.backwardEditResult = {
      yesterdayEditable:isEditableHistoryDate("2026-08-21",parseLocalDate("2026-08-22")),
      earlySameDayEditable:isEditableHistoryDate("2026-08-21",new Date(2026,7,22,0,1)),
      lateSameDayEditable:isEditableHistoryDate("2026-08-21",new Date(2026,7,22,23,59)),
      expiredAtNextMidnight:!isEditableHistoryDate("2026-08-21",new Date(2026,7,23,0,0)),
      twoDaysAgoEditable:isEditableHistoryDate("2026-08-20",parseLocalDate("2026-08-22")),
      todayEditable:isEditableHistoryDate("2026-08-22",parseLocalDate("2026-08-22")),
      beforeStreak:streakBeforeBackwardEdit,
      afterStreak:questStreak(state.quests[0],parseLocalDate("2026-08-22")),
      beforeConsistency:consistencyBeforeBackwardEdit,
      afterConsistency:questConsistency(state.quests[0],parseLocalDate("2026-08-22")),
      xpAdded:totalXp()-xpBeforeBackwardEdit,
      completionDate:localDateKey(new Date(backwardRecord.completedAt))
    };
    toggleQuestCompletionForDate("q_daily","2026-08-21");
    globalThis.backwardEditUndoResult = {
      streak:questStreak(state.quests[0],parseLocalDate("2026-08-22")),
      consistency:questConsistency(state.quests[0],parseLocalDate("2026-08-22")),
      xpRestored:totalXp()===xpBeforeBackwardEdit,
      emptyDayRemoved:!state.completions["2026-08-21"]
    };
    state.startedOn = "2026-08-22";
    globalThis.strongDayResult = {
      historyScores:["2026-08-17","2026-08-18","2026-08-19","2026-08-20"].map(dateKey=>dailyScoreFor(parseLocalDate(dateKey))),
      characterCount:strongDayCount(parseLocalDate("2026-08-22"))
    };
    renderCharacter();
    globalThis.renderedStrongDayStat = document.querySelector("#strongDayStat").textContent;
    state.quests.push({id:"q_once",title:"One-off mission",categoryId:"body",difficulty:"epic",type:"oneoff",schedule:{mode:"once"},active:true,createdOn:"2026-08-17"});
    state.completions["2026-08-22"] = {q_once:normalizeCompletionRecord({difficulty:"epic",xpAwarded:100},state.quests.at(-1),"2026-08-22")};
    globalThis.oneOffScoreResult = {
      openOneOffDoesNotLowerScore:dailyScoreFor(parseLocalDate("2026-08-18")),
      completedOneOffDoesNotRaiseScore:dailyScoreFor(parseLocalDate("2026-08-22")),
      completedOneOffStillEarnsXp:completedXpForDate(parseLocalDate("2026-08-22")),
      recurringPlannedXp:plannedXpForDate(parseLocalDate("2026-08-22")),
      recurringCompletedXp:completedScoreXpForDate(parseLocalDate("2026-08-22"))
    };
    state.completions = {"2026-08-22":{q_deleted:{completedAt:"2026-08-22T08:00:00.000Z",questTitle:"Archived quest",categoryId:"body",difficulty:"hard",xpAwarded:40}}};
    state.quests = [];
    globalThis.deletedHistoryResult = {
      totalXp:totalXp(),dayXp:completedXpForDate(parseLocalDate("2026-08-22")),
      title:historicalQuestFromCompletion("q_deleted","2026-08-22").title
    };
  `,context);

  assert.deepEqual({...context.stateTestResult.streak},{current:5,best:5});
  assert.deepEqual({...context.stateTestResult.consistency},{completed:5,scheduled:6,percentage:83});
  assert.match(context.questCardHtml,/<use href="#icon-fire"><\/use><\/svg> <strong>5<\/strong> streak/);
  assert.match(context.questCardHtml,/class="difficulty-dot difficulty-dot-hard"/);
  assert.doesNotMatch(context.questCardHtml,/[⚪🟢🔵🟠🔴🟣]/u);
  assert.match(context.questCardHtml,/✓ <strong>5\/6<\/strong> completed/);
  assert.match(context.questCardHtml,/>83%<\/span>/);
  assert.deepEqual({...context.scheduleConsistencyResult.weekday},{completed:4,scheduled:5,percentage:80});
  assert.equal(context.scheduleConsistencyResult.oneoff,null);
  assert.deepEqual(JSON.parse(JSON.stringify(context.backwardEditResult)),{
    yesterdayEditable:true,earlySameDayEditable:true,lateSameDayEditable:true,expiredAtNextMidnight:true,
    twoDaysAgoEditable:false,todayEditable:false,
    beforeStreak:{current:0,best:4},afterStreak:{current:5,best:5},
    beforeConsistency:{completed:4,scheduled:6,percentage:67},afterConsistency:{completed:5,scheduled:6,percentage:83},
    xpAdded:40,completionDate:"2026-08-21"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.backwardEditUndoResult)),{
    streak:{current:0,best:4},consistency:{completed:4,scheduled:6,percentage:67},xpRestored:true,emptyDayRemoved:true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.strongDayResult)),{
    historyScores:[100,100,25,100],characterCount:3
  });
  assert.equal(context.renderedStrongDayStat,3);
  assert.deepEqual(JSON.parse(JSON.stringify(context.oneOffScoreResult)),{
    openOneOffDoesNotLowerScore:100,
    completedOneOffDoesNotRaiseScore:0,
    completedOneOffStillEarnsXp:100,
    recurringPlannedXp:40,
    recurringCompletedXp:0
  });
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
      level90ClearUserSyncQueue,level90NeedsMigrationDecision,syncLevel90,level90UseCloudData,
      setCloudCount(count){ level90LastCloudRecordCount = count; },
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

  context.state = reordered;
  context.cloudApi.queueLevel90StateChanges(base,reordered);
  const guardedWrites = [];
  const cloudFixtures = {
    level90_profiles:[],level90_categories:[],level90_quests:[],level90_completions:[]
  };
  context.cloudApi.setClient({
    from(table) {
      return {
        select() {
          const response = Promise.resolve({data:cloudFixtures[table],error:null});
          response.order = ()=>Promise.resolve({data:cloudFixtures[table],error:null});
          return response;
        },
        async upsert(row,options) { guardedWrites.push({table,row,options}); return {error:null}; }
      };
    }
  });
  assert.equal(context.cloudApi.level90NeedsMigrationDecision(),true);
  await context.cloudApi.syncLevel90({manual:true});
  assert.equal(guardedWrites.length,0,"an unresolved secondary device must not upload pending order changes");
  assert.equal(context.cloudApi.level90LoadSyncQueue().filter(item=>item.userId === "user-a").length,2);

  const preservedOtherUserOperation = {
    queueId:"other-user-op",userId:"user-b",entity:"quest",id:"q_other",record:questA,
    sortOrder:0,deletedAt:null,clientUpdatedAt:"2026-08-22T08:00:00.000Z",queuedAt:1
  };
  context.localStorage.setItem("level90.syncQueue.v1",JSON.stringify([...context.cloudApi.level90LoadSyncQueue(),preservedOtherUserOperation]));
  context.cloudApi.level90ClearUserSyncQueue("user-a");
  assert.deepEqual(context.cloudApi.level90LoadSyncQueue().map(item=>item.userId),["user-b"]);
  context.cloudApi.level90ClearUserSyncQueue("user-b");

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

  context.state.quests.push({...questA,id:"q_laptop",title:"Laptop only"});
  context.state.completions["2026-08-22"].q_laptop = {completedAt:"2026-08-22T11:00:00.000Z",questTitle:"Laptop only",categoryId:"body",difficulty:"easy",xpAwarded:10};
  context.cloudApi.level90ApplyCloudSnapshot({
    profile:[],categories:snapshot.categories,
    quests:[snapshot.quests[1]],completions:[snapshot.completions[1]]
  },{protectLocal:false,cloudOnly:true});
  assert.deepEqual(context.state.quests.map(quest=>quest.id),["q_remote"],"cloud replacement must remove laptop-only quests");
  assert.deepEqual(Object.keys(context.state.completions["2026-08-22"]),["q_remote"],"cloud replacement must remove laptop-only completions");

  context.localStorage.removeItem("level90.cloudMigration.v1.user-a");
  context.state = {
    ...structuredClone(base),quests:[{...questA,id:"q_laptop",title:"Laptop only"}],
    completions:{"2026-08-22":{q_laptop:{completedAt:"2026-08-22T11:00:00.000Z",questTitle:"Laptop only",categoryId:"body",difficulty:"easy",xpAwarded:10}}}
  };
  context.cloudApi.queueLevel90StateChanges(base,context.state);
  const phoneSnapshot = {
    level90_profiles:[{user_id:"user-a",started_on:"2026-08-01",profile_name:"Phone",theme:"dark",palette:"arctic",schema_version:3}],
    level90_categories:snapshot.categories,
    level90_quests:[snapshot.quests[1]],
    level90_completions:[snapshot.completions[1]]
  };
  context.cloudApi.setClient({
    from(table) {
      return {select() {
        const response = Promise.resolve({data:phoneSnapshot[table],error:null});
        response.order = ()=>Promise.resolve({data:phoneSnapshot[table],error:null});
        return response;
      }};
    }
  });
  context.cloudApi.setCloudCount(4);
  await context.cloudApi.level90UseCloudData();
  assert.deepEqual(context.state.quests.map(quest=>quest.id),["q_remote"]);
  assert.equal(context.state.profileName,"Phone");
  assert.equal(context.cloudApi.level90LoadSyncQueue().filter(item=>item.userId === "user-a").length,0);
  assert.equal(context.localStorage.getItem("level90.cloudMigration.v1.user-a"),"complete");
  const recovery = JSON.parse(context.localStorage.getItem("level90.beforeCloudRestore.v1.user-a"));
  assert.equal(recovery.state.quests[0].id,"q_laptop");
}

(async()=>{
  runAppStateTests();
  await runCloudTests();
  console.log("Level90 state and sync tests passed");
})().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
