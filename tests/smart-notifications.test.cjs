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
    questScheduledOn,questPlannedOn,streakBeforeToday,median,adaptiveTriggerMinute,
    summaryDue,evaluateStreakRescue,notificationSummaryStats,morningBrief,eveningRecap,rescueCopy
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
    morning_brief_enabled:true,morning_brief_time:"10:00",
    evening_recap_enabled:true,evening_recap_time:"21:00",
    rescue_intensity:"aggressive",final_rescue_time:"20:15",
    quiet_start:"21:30",quiet_end:"08:00",max_daily:3,min_streak:3,
    adaptive_grace_minutes:30,cooldown_minutes:90,...overrides
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
    completed_at:`${date}T${String(hour).padStart(2,"0")}:00:00.000Z`,xp_awarded:20
  };
}

async function run() {
  const {api} = loadRuleApi();
  const quest = dailyQuest();
  const history = [completion("2026-08-20"),completion("2026-08-21"),completion("2026-08-22")];

  const eligible = api.evaluateStreakRescue(preference(),[quest],history,new Date("2026-08-23T19:00:00.000Z"));
  assert.equal(eligible.result,"candidates");
  assert.equal(eligible.candidate.streak,3);
  assert.equal(eligible.candidate.triggerMinute,17*60+30,"usual 17:00 completion plus 30-minute aggressive grace");
  assert.equal(eligible.candidate.learnedTiming,true);
  assert.equal(eligible.candidates.length,1);

  const early = api.evaluateStreakRescue(preference(),[quest],history,new Date("2026-08-23T17:20:00.000Z"));
  assert.equal(early.result,"before_adaptive_time");
  assert.equal(early.detail.next_trigger_local,"17:30");

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
  assert.equal(fallback.result,"candidates");
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
  assert.equal(priority.candidates.length,2,"every eligible quest should be returned, not only the first available quest");
  assert.equal(priority.candidates[1].quest.id,"q_read");

  assert.equal(api.summaryDue(10*60,10*60,12*60),true,"the morning brief is due at 10:00");
  assert.equal(api.summaryDue(21*60,10*60,12*60),true,"the morning brief remains catch-up eligible later that day");
  assert.equal(api.summaryDue(22*60+1,10*60,12*60),false,"the morning catch-up window expires after 12 hours");
  assert.equal(api.summaryDue(21*60,21*60,3*60),true,"the evening recap is independently due at 21:00");

  const summaryHistory = [
    completion("2026-08-20"),completion("2026-08-21"),completion("2026-08-22"),completion("2026-08-23")
  ];
  const stats = api.notificationSummaryStats(preference(),[quest],summaryHistory,new Date("2026-08-23T21:00:00.000Z"));
  assert.equal(stats.yesterdayScore,100);
  assert.equal(stats.completedToday,1);
  assert.equal(stats.plannedToday,1);
  assert.equal(stats.strongestStreak,4);
  assert.match(api.morningBrief(stats).title,/Morning briefing/);
  assert.match(api.eveningRecap(stats).body,/1\/1 quests complete/);

  const oneOff = dailyQuest({id:"q_once",title:"One-off",difficulty:"epic",quest_type:"oneoff"});
  const scoreWithOneOff = api.notificationSummaryStats(
    preference(),[quest,oneOff],[...summaryHistory,completion("2026-08-23",18,"q_once")],new Date("2026-08-23T21:00:00.000Z")
  );
  assert.equal(scoreWithOneOff.scoreToday,100,"completed one-off XP must not change the recurring daily score");
  assert.equal(scoreWithOneOff.plannedToday,2,"one-off quests should remain visible in summary quest counts");
  assert.equal(scoreWithOneOff.completedToday,2,"completed one-off quests should remain visible in summary quest counts");

  const grouped = api.rescueCopy(priority.candidates,"adaptive");
  assert.match(grouped.title,/2 streaks/);
  assert.match(grouped.body,/Move/);
  assert.match(grouped.body,/Read/);

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
