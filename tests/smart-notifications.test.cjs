"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {stripTypeScriptTypes} = require("node:module");

const root = path.resolve(__dirname,"..");
const functionPath = path.join(root,"supabase/functions/level90-notifications/index.ts");

function loadRuleApi(environment={}) {
  let capturedHandler = null;
  let source = fs.readFileSync(functionPath,"utf8").replace(/^import .*;\s*$/gm,"");
  source += `\nglobalThis.smartRuleApi={
    timeMinutes,minuteLabel,isQuietMinute,zonedParts,dateKeyAdd,weekdayForDateKey,
    questScheduledOn,streakBeforeToday,median,adaptiveTriggerMinute,evaluateStreakRescue
  };`;
  const context = vm.createContext({
    console,Date,Intl,Map,Set,Promise,Response,JSON,Object,Math,Number,String,Array,
    Deno:{env:{get(name){ return environment[name]; }},serve(handler){ capturedHandler = handler; }},
    createClient(){},webPush:{setVapidDetails(){},sendNotification(){}}
  });
  vm.runInContext(stripTypeScriptTypes(source,{mode:"transform"}),context);
  return {api:context.smartRuleApi,handler:capturedHandler};
}

function preference(overrides={}) {
  return {
    user_id:"user-a",timezone:"UTC",smart_enabled:true,streak_rescue_enabled:true,
    quiet_start:"21:30",quiet_end:"08:00",max_daily:2,min_streak:3,
    adaptive_grace_minutes:60,cooldown_minutes:240,...overrides
  };
}

function dailyQuest(overrides={}) {
  return {
    id:"q_read",title:"Read",difficulty:"medium",quest_type:"recurring",
    schedule:{mode:"daily"},active:true,sort_order:0,created_on:"2026-08-19",...overrides
  };
}

function completion(date,hour=17,questId="q_read") {
  return {
    quest_id:questId,completion_date:date,
    completed_at:`${date}T${String(hour).padStart(2,"0")}:00:00.000Z`
  };
}

async function run() {
  const {api} = loadRuleApi();
  const quest = dailyQuest();
  const history = [completion("2026-08-20"),completion("2026-08-21"),completion("2026-08-22")];

  const eligible = api.evaluateStreakRescue(preference(),[quest],history,new Date("2026-08-23T19:00:00.000Z"));
  assert.equal(eligible.result,"candidate");
  assert.equal(eligible.candidate.streak,3);
  assert.equal(eligible.candidate.triggerMinute,18*60,"usual 17:00 completion plus one-hour grace");
  assert.equal(eligible.candidate.learnedTiming,true);

  const early = api.evaluateStreakRescue(preference(),[quest],history,new Date("2026-08-23T17:30:00.000Z"));
  assert.equal(early.result,"before_adaptive_time");
  assert.equal(early.detail.next_trigger_local,"18:00");

  const completedToday = api.evaluateStreakRescue(
    preference(),[quest],[...history,completion("2026-08-23",16)],new Date("2026-08-23T19:00:00.000Z")
  );
  assert.equal(completedToday.result,"no_at_risk_streak","a completed quest must never be reminded");

  const quiet = api.evaluateStreakRescue(preference(),[quest],history,new Date("2026-08-23T22:00:00.000Z"));
  assert.equal(quiet.result,"quiet_hours");

  const insufficientStreak = api.evaluateStreakRescue(preference({min_streak:5}),[quest],history,new Date("2026-08-23T19:00:00.000Z"));
  assert.equal(insufficientStreak.result,"no_at_risk_streak");

  const fallbackHistory = [completion("2026-08-21",9),completion("2026-08-22",9)];
  const fallback = api.evaluateStreakRescue(
    preference({min_streak:2}),[quest],fallbackHistory,new Date("2026-08-23T18:15:00.000Z")
  );
  assert.equal(fallback.result,"candidate");
  assert.equal(fallback.candidate.triggerMinute,18*60,"fewer than three samples must use the transparent 18:00 fallback");
  assert.equal(fallback.candidate.learnedTiming,false);

  const weekdayQuest = dailyQuest({schedule:{mode:"weekdays",days:[1,2,3,4,5]}});
  const sunday = api.evaluateStreakRescue(preference({min_streak:2}),[weekdayQuest],fallbackHistory,new Date("2026-08-23T19:00:00.000Z"));
  assert.equal(sunday.result,"no_at_risk_streak","quests not scheduled today must stay silent");

  const longerQuest = dailyQuest({id:"q_move",title:"Move",sort_order:1,created_on:"2026-08-18"});
  const longerHistory = [
    completion("2026-08-19",16,"q_move"),completion("2026-08-20",16,"q_move"),
    completion("2026-08-21",16,"q_move"),completion("2026-08-22",16,"q_move")
  ];
  const priority = api.evaluateStreakRescue(preference(),[quest,longerQuest],[...history,...longerHistory],new Date("2026-08-23T19:00:00.000Z"));
  assert.equal(priority.candidate.quest.id,"q_move","the longest at-risk streak should be protected first");

  const {handler} = loadRuleApi({
    SUPABASE_URL:"https://project.supabase.co",SUPABASE_ANON_KEY:"publishable",
    VAPID_PUBLIC_KEY:"public",VAPID_PRIVATE_KEY:"private",VAPID_SUBJECT:"mailto:test@example.com",
    LEVEL90_DISPATCH_SECRET:"expected-secret"
  });
  const unauthorized = await handler(new Request("https://project.supabase.co/functions/v1/level90-notifications",{
    method:"POST",headers:{"content-type":"application/json","x-level90-dispatch-secret":"wrong-secret"},
    body:JSON.stringify({action:"dispatch"})
  }));
  assert.equal(unauthorized.status,401,"the scheduled dispatch endpoint must reject the wrong secret");

  console.log("Level90 smart notification rule tests passed");
}

run().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
