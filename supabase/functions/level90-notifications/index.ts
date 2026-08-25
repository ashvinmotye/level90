import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-level90-dispatch-secret",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const difficultyXp:Record<string,number> = {tiny:5,easy:10,medium:20,hard:40,major:75,epic:100};

type DatabaseClient = ReturnType<typeof createClient>;
type RuleKey = "morning_brief" | "evening_recap" | "streak_rescue";
type SmartPreference = {
  user_id:string;
  timezone:string;
  smart_enabled:boolean;
  morning_brief_enabled:boolean;
  morning_brief_time:string;
  evening_recap_enabled:boolean;
  evening_recap_time:string;
  streak_rescue_enabled:boolean;
  rescue_intensity:string;
  final_rescue_time:string;
  quiet_start:string;
  quiet_end:string;
  max_daily:number;
  min_streak:number;
  adaptive_grace_minutes:number;
  cooldown_minutes:number;
};
type QuestRecord = {
  id:string;
  title:string;
  difficulty:string;
  quest_type:string;
  schedule:{mode?:string;days?:number[]} | null;
  active:boolean;
  sort_order:number;
  created_on:string;
};
type CompletionRecord = {
  quest_id:string;
  completion_date:string;
  completed_at:string;
  xp_awarded?:number;
};
type NotificationPayload = {
  title:string;
  body:string;
  icon:string;
  badge:string;
  tag:string;
  url:string;
  ttlSeconds?:number;
};
type RescueCandidate = {
  quest:QuestRecord;
  streak:number;
  triggerMinute:number;
  overdueMinutes:number;
  learnedTiming:boolean;
  sampleCount:number;
};
type RuleResult = {
  result:string;
  detail:Record<string,unknown>;
  candidate?:RescueCandidate;
  candidates?:RescueCandidate[];
  atRiskCandidates?:RescueCandidate[];
};
type SummaryStats = {
  localDate:string;
  yesterdayDate:string;
  level:number;
  xpToNext:number;
  plannedToday:number;
  completedToday:number;
  scoreToday:number;
  yesterdayScore:number;
  strongestStreak:number;
  atRiskCount:number;
};

function json(body:Record<string,unknown>,status=200) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"}
  });
}

function bundledEnvironmentKey(legacyName:string,bundleName:string) {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try {
    const bundle = JSON.parse(Deno.env.get(bundleName) || "{}");
    if (typeof bundle.default === "string") return bundle.default;
    return Object.values(bundle).find(value=>typeof value === "string") as string | undefined;
  } catch {
    return undefined;
  }
}

function timeMinutes(value:string | null | undefined) {
  const [hours,minutes] = String(value || "00:00").split(":").map(Number);
  return Math.max(0,Math.min(1439,(Number.isFinite(hours) ? hours : 0)*60+(Number.isFinite(minutes) ? minutes : 0)));
}

function minuteLabel(minutes:number) {
  const normalized = ((Math.round(minutes)%1440)+1440)%1440;
  return `${String(Math.floor(normalized/60)).padStart(2,"0")}:${String(normalized%60).padStart(2,"0")}`;
}

function isQuietMinute(current:number,start:number,end:number) {
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function minutesUntil(current:number,target:number) {
  return ((target-current)%1440+1440)%1440;
}

function summaryDue(current:number,scheduled:number,catchupMinutes:number) {
  return current >= scheduled && current-scheduled <= catchupMinutes;
}

function zonedParts(date:Date,timezone:string) {
  let formatter:Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA",{
      timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA",{
      timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    });
    timezone = "UTC";
  }
  const values:Record<string,string> = {};
  formatter.formatToParts(date).forEach(part=>{
    if (part.type !== "literal") values[part.type] = part.value;
  });
  const dateKey = `${values.year}-${values.month}-${values.day}`;
  const hour = Number(values.hour || 0);
  const minute = Number(values.minute || 0);
  return {timezone,dateKey,hour,minute,minuteOfDay:hour*60+minute};
}

function dateKeyAdd(dateKey:string,days:number) {
  const [year,month,day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1,day+days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
}

function weekdayForDateKey(dateKey:string) {
  const [year,month,day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year,month-1,day)).getUTCDay();
}

function questScheduledOn(quest:QuestRecord,dateKey:string) {
  if (!quest.active || quest.quest_type !== "recurring" || dateKey < quest.created_on) return false;
  const mode = quest.schedule?.mode || "daily";
  if (mode === "daily") return true;
  if (mode === "weekdays") return Array.isArray(quest.schedule?.days) && quest.schedule.days.includes(weekdayForDateKey(dateKey));
  return false;
}

function questPlannedOn(quest:QuestRecord,dateKey:string,completionDates:Set<string>) {
  if (!quest.active || dateKey < quest.created_on) return false;
  if (quest.quest_type === "recurring") return questScheduledOn(quest,dateKey);
  const completedBefore = [...completionDates].some(completionDate=>completionDate < dateKey);
  return completionDates.has(dateKey) || !completedBefore;
}

function streakBeforeToday(quest:QuestRecord,completionDates:Set<string>,todayKey:string) {
  let streak = 0;
  let cursor = dateKeyAdd(todayKey,-1);
  for (let checked=0;checked<5000 && cursor >= quest.created_on;checked+=1) {
    if (questScheduledOn(quest,cursor)) {
      if (!completionDates.has(cursor)) break;
      streak += 1;
    }
    cursor = dateKeyAdd(cursor,-1);
  }
  return streak;
}

function median(values:number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  const middle = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : Math.round((sorted[middle-1]+sorted[middle])/2);
}

function adaptiveTriggerMinute(preference:SmartPreference,completionTimes:number[]) {
  const samples = completionTimes.slice(0,12);
  const learnedTiming = samples.length >= 3;
  const usualMinute = learnedTiming ? median(samples) : null;
  const rawTrigger = usualMinute == null ? 18*60 : usualMinute+preference.adaptive_grace_minutes;
  const quietStart = timeMinutes(preference.quiet_start);
  const latestUsefulMinute = quietStart >= 13*60 ? quietStart-60 : 20*60;
  return {
    triggerMinute:Math.min(Math.max(rawTrigger,12*60),latestUsefulMinute),
    learnedTiming,
    sampleCount:samples.length
  };
}

function evaluateStreakRescue(preference:SmartPreference,quests:QuestRecord[],completions:CompletionRecord[],now:Date):RuleResult {
  const local = zonedParts(now,preference.timezone || "UTC");
  const quietStart = timeMinutes(preference.quiet_start);
  const quietEnd = timeMinutes(preference.quiet_end);
  if (isQuietMinute(local.minuteOfDay,quietStart,quietEnd)) {
    return {result:"quiet_hours",detail:{local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay)}};
  }

  const completionsByQuest = new Map<string,CompletionRecord[]>();
  completions.forEach(completion=>{
    if (!completionsByQuest.has(completion.quest_id)) completionsByQuest.set(completion.quest_id,[]);
    completionsByQuest.get(completion.quest_id)!.push(completion);
  });

  const waiting:RescueCandidate[] = [];
  const eligible:RescueCandidate[] = [];
  quests.filter(quest=>questScheduledOn(quest,local.dateKey)).forEach(quest=>{
    const questCompletions = completionsByQuest.get(quest.id) || [];
    if (questCompletions.some(completion=>completion.completion_date === local.dateKey)) return;
    const completionDates = new Set(questCompletions.map(completion=>completion.completion_date));
    const streak = streakBeforeToday(quest,completionDates,local.dateKey);
    if (streak < preference.min_streak) return;
    const completionTimes = questCompletions
      .slice()
      .sort((a,b)=>Date.parse(b.completed_at)-Date.parse(a.completed_at))
      .map(completion=>zonedParts(new Date(completion.completed_at),local.timezone).minuteOfDay);
    const timing = adaptiveTriggerMinute(preference,completionTimes);
    const candidate = {
      quest,streak,...timing,
      overdueMinutes:Math.max(0,local.minuteOfDay-timing.triggerMinute)
    };
    if (local.minuteOfDay >= timing.triggerMinute) eligible.push(candidate);
    else waiting.push(candidate);
  });

  const byPriority = (a:RescueCandidate,b:RescueCandidate) =>
    b.streak-a.streak || b.overdueMinutes-a.overdueMinutes || a.quest.sort_order-b.quest.sort_order;
  eligible.sort(byPriority);
  waiting.sort(byPriority);
  const atRiskCandidates = [...eligible,...waiting].sort(byPriority);
  if (eligible.length) {
    const candidate = eligible[0];
    return {
      result:"candidates",
      candidate,
      candidates:eligible,
      atRiskCandidates,
      detail:{
        local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay),quest_id:candidate.quest.id,
        quest_ids:eligible.map(item=>item.quest.id),candidate_count:eligible.length,at_risk_count:atRiskCandidates.length,
        streak:candidate.streak,trigger_local:minuteLabel(candidate.triggerMinute),
        learned_timing:candidate.learnedTiming,sample_count:candidate.sampleCount
      }
    };
  }
  if (waiting.length) {
    const next = waiting.slice().sort((a,b)=>a.triggerMinute-b.triggerMinute || byPriority(a,b))[0];
    return {
      result:"before_adaptive_time",
      candidates:[],
      atRiskCandidates,
      detail:{
        local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay),
        next_trigger_local:minuteLabel(next.triggerMinute),quest_id:next.quest.id,
        at_risk_count:atRiskCandidates.length,streak:next.streak,learned_timing:next.learnedTiming
      }
    };
  }
  return {result:"no_at_risk_streak",candidates:[],atRiskCandidates:[],detail:{local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay)}};
}

function xpRequiredForLevel(level:number) {
  return level <= 1 ? 0 : Math.round(80*Math.pow(level-1,1.55));
}

function levelFromXp(xp:number) {
  let level = 1;
  while (level < 90 && xpRequiredForLevel(level+1) <= xp) level += 1;
  return level;
}

function completionMap(completions:CompletionRecord[]) {
  const byQuest = new Map<string,Set<string>>();
  completions.forEach(completion=>{
    if (!byQuest.has(completion.quest_id)) byQuest.set(completion.quest_id,new Set());
    byQuest.get(completion.quest_id)!.add(completion.completion_date);
  });
  return byQuest;
}

function notificationSummaryStats(preference:SmartPreference,quests:QuestRecord[],completions:CompletionRecord[],now:Date):SummaryStats {
  const localDate = zonedParts(now,preference.timezone || "UTC").dateKey;
  const yesterdayDate = dateKeyAdd(localDate,-1);
  const byQuest = completionMap(completions);
  const planned = (dateKey:string) => quests.filter(quest=>questPlannedOn(quest,dateKey,byQuest.get(quest.id) || new Set()));
  const completed = (quest:QuestRecord,dateKey:string) => byQuest.get(quest.id)?.has(dateKey) || false;
  const score = (dateKey:string) => {
    const plannedQuests = planned(dateKey).filter(quest=>quest.quest_type === "recurring");
    const plannedXp = plannedQuests.reduce((sum,quest)=>sum+(difficultyXp[quest.difficulty] || 10),0);
    const earnedXp = plannedQuests.filter(quest=>completed(quest,dateKey)).reduce((sum,quest)=>sum+(difficultyXp[quest.difficulty] || 10),0);
    return plannedXp ? Math.min(100,Math.round(earnedXp/plannedXp*100)) : 0;
  };
  const todayQuests = planned(localDate);
  const totalXp = completions.reduce((sum,completion)=>sum+Number(completion.xp_awarded ?? 0),0);
  const level = levelFromXp(totalXp);
  let strongestStreak = 0;
  let atRiskCount = 0;
  quests.filter(quest=>quest.quest_type === "recurring").forEach(quest=>{
    const dates = byQuest.get(quest.id) || new Set<string>();
    let streak = streakBeforeToday(quest,dates,localDate);
    if (questScheduledOn(quest,localDate) && dates.has(localDate)) streak += 1;
    strongestStreak = Math.max(strongestStreak,streak);
    if (questScheduledOn(quest,localDate) && !dates.has(localDate) && streak >= preference.min_streak) atRiskCount += 1;
  });
  return {
    localDate,yesterdayDate,level,
    xpToNext:level >= 90 ? 0 : Math.max(0,xpRequiredForLevel(level+1)-totalXp),
    plannedToday:todayQuests.length,
    completedToday:todayQuests.filter(quest=>completed(quest,localDate)).length,
    scoreToday:score(localDate),
    yesterdayScore:score(yesterdayDate),
    strongestStreak,atRiskCount
  };
}

function morningBrief(stats:SummaryStats) {
  const streak = stats.strongestStreak ? ` · best streak ${stats.strongestStreak}d` : "";
  const next = stats.level >= 90 ? " · max level reached" : ` · ${stats.xpToNext} XP to L${stats.level+1}`;
  return {
    title:`Level ${stats.level} · Morning briefing`,
    body:`Yesterday ${stats.yesterdayScore}/100 · ${stats.plannedToday} quests today${streak}${next}`
  };
}

function eveningRecap(stats:SummaryStats) {
  const open = Math.max(0,stats.plannedToday-stats.completedToday);
  const risk = stats.atRiskCount ? ` · ${stats.atRiskCount} streak${stats.atRiskCount === 1 ? "" : "s"} at risk` : "";
  return {
    title:`Your day so far · ${stats.scoreToday}/100`,
    body:`${stats.completedToday}/${stats.plannedToday} quests complete · ${open} open${risk}`
  };
}

function rescueCopy(candidates:RescueCandidate[],stage:string) {
  const shown = candidates.slice(0,3);
  const labels = shown.map(candidate=>`${candidate.quest.title} 🔥${candidate.streak}`);
  if (candidates.length > shown.length) labels.push(`+${candidates.length-shown.length} more`);
  return {
    title:stage === "final" ? "Final streak check 🔥" : candidates.length === 1 ? `Protect your 🔥 ${candidates[0].streak} streak` : `${candidates.length} streaks need you 🔥`,
    body:labels.join(" · ").slice(0,240)
  };
}

function notificationPayload(title:string,body:string,dedupeKey:string,url:string,ttlSeconds:number):NotificationPayload {
  return {
    title,body,icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",
    tag:`level90-${dedupeKey}`,url,ttlSeconds
  };
}

async function updateRuleState(admin:DatabaseClient,userId:string,result:string,detail:Record<string,unknown>) {
  await admin.from("level90_notification_preferences").update({
    last_evaluated_at:new Date().toISOString(),last_rule_result:result,last_rule_detail:detail
  }).eq("user_id",userId);
}

async function queueNotification(
  admin:DatabaseClient,preference:SmartPreference,subscriptions:Array<{id:string}>,ruleKey:RuleKey,
  localDate:string,dedupeKey:string,title:string,body:string,payload:NotificationPayload,
  reason:Record<string,unknown>,questId:string | null=null
) {
  const {data:outbox,error:outboxError} = await admin
    .from("level90_notification_outbox")
    .insert({
      user_id:preference.user_id,rule_key:ruleKey,dedupe_key:dedupeKey,
      local_date:localDate,quest_id:questId,title,body,payload,reason,
      target_count:subscriptions.length
    }).select("id").single();
  if (outboxError) {
    if (outboxError.code === "23505") return "already_queued";
    throw outboxError;
  }
  const {error:deliveryError} = await admin.from("level90_notification_deliveries").insert(
    subscriptions.map(subscription=>({
      notification_id:outbox.id,user_id:preference.user_id,subscription_id:subscription.id
    }))
  );
  if (deliveryError) throw deliveryError;
  return "queued";
}

async function evaluateSmartUser(admin:DatabaseClient,preference:SmartPreference,now:Date) {
  const {data:subscriptions,error:subscriptionError} = await admin
    .from("level90_push_subscriptions").select("id")
    .eq("user_id",preference.user_id).eq("enabled",true);
  if (subscriptionError) throw subscriptionError;
  if (!subscriptions?.length) {
    await updateRuleState(admin,preference.user_id,"no_device",{});
    return ["no_device"];
  }

  const {data:quests,error:questError} = await admin
    .from("level90_quests")
    .select("id,title,difficulty,quest_type,schedule,active,sort_order,created_on")
    .eq("user_id",preference.user_id).eq("active",true).is("deleted_at",null);
  if (questError) throw questError;
  const {data:completions,error:completionError} = await admin
    .from("level90_completions")
    .select("quest_id,completion_date,completed_at,xp_awarded")
    .eq("user_id",preference.user_id).is("deleted_at",null);
  if (completionError) throw completionError;

  const allQuests = (quests || []) as QuestRecord[];
  const allCompletions = (completions || []) as CompletionRecord[];
  const local = zonedParts(now,preference.timezone || "UTC");
  const stats = notificationSummaryStats(preference,allQuests,allCompletions,now);
  const outcomes:string[] = [];

  if (preference.morning_brief_enabled && summaryDue(local.minuteOfDay,timeMinutes(preference.morning_brief_time),12*60)) {
    const copy = morningBrief(stats);
    const outcome = await queueNotification(
      admin,preference,subscriptions,"morning_brief",local.dateKey,`morning_brief:${local.dateKey}`,
      copy.title,copy.body,notificationPayload(copy.title,copy.body,`morning-${local.dateKey}`,"./index.html#character",12*60*60),
      {local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay),stats}
    );
    outcomes.push(`morning_${outcome}`);
  }

  if (preference.evening_recap_enabled && summaryDue(local.minuteOfDay,timeMinutes(preference.evening_recap_time),3*60)) {
    const copy = eveningRecap(stats);
    const outcome = await queueNotification(
      admin,preference,subscriptions,"evening_recap",local.dateKey,`evening_recap:${local.dateKey}`,
      copy.title,copy.body,notificationPayload(copy.title,copy.body,`evening-${local.dateKey}`,"./index.html#today",3*60*60),
      {local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay),stats}
    );
    outcomes.push(`evening_${outcome}`);
  }

  if (!preference.streak_rescue_enabled) {
    const result = outcomes.length ? "summary_only" : "all_rules_paused";
    await updateRuleState(admin,preference.user_id,result,{local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay)});
    return outcomes.length ? outcomes : [result];
  }

  const recurring = allQuests.filter(quest=>quest.quest_type === "recurring");
  const rule = evaluateStreakRescue(preference,recurring,allCompletions,now);
  const finalDue = preference.rescue_intensity !== "calm" && local.minuteOfDay >= timeMinutes(preference.final_rescue_time);
  const candidates = finalDue ? (rule.atRiskCandidates || []) : (rule.candidates || []);
  if (!candidates.length) {
    await updateRuleState(admin,preference.user_id,rule.result,rule.detail);
    outcomes.push(rule.result);
    return outcomes;
  }

  const {data:todayRescues,error:rescueError} = await admin
    .from("level90_notification_outbox")
    .select("created_at,dedupe_key,reason,status")
    .eq("user_id",preference.user_id).eq("rule_key","streak_rescue").eq("local_date",local.dateKey)
    .in("status",["pending","sent"]).order("created_at",{ascending:false});
  if (rescueError) throw rescueError;
  const rescues = todayRescues || [];
  if (rescues.length >= preference.max_daily) {
    await updateRuleState(admin,preference.user_id,"daily_limit",{...rule.detail,max_daily:preference.max_daily});
    outcomes.push("daily_limit");
    return outcomes;
  }

  const stage = finalDue ? "final" : "adaptive";
  if (stage === "final" && rescues.some(item=>String(item.dedupe_key).includes(`streak_rescue:final:${local.dateKey}`))) {
    await updateRuleState(admin,preference.user_id,"already_queued",{...rule.detail,stage});
    outcomes.push("already_queued");
    return outcomes;
  }
  const adaptiveLimit = preference.rescue_intensity === "calm" ? preference.max_daily : Math.max(1,preference.max_daily-1);
  if (stage === "adaptive" && rescues.length >= adaptiveLimit) {
    await updateRuleState(admin,preference.user_id,"reserved_final",{...rule.detail,final_rescue_local:minuteLabel(timeMinutes(preference.final_rescue_time))});
    outcomes.push("reserved_final");
    return outcomes;
  }

  let selected = candidates;
  if (stage === "adaptive") {
    const alreadyIncluded = new Set<string>();
    rescues.forEach(item=>{
      const ids = Array.isArray(item.reason?.quest_ids) ? item.reason.quest_ids : [];
      ids.forEach((id:unknown)=>alreadyIncluded.add(String(id)));
    });
    selected = candidates.filter(candidate=>!alreadyIncluded.has(candidate.quest.id));
    if (!selected.length) {
      await updateRuleState(admin,preference.user_id,"already_queued",{...rule.detail,stage});
      outcomes.push("already_queued");
      return outcomes;
    }
    const lastRescue = rescues[0];
    if (lastRescue && now.getTime()-Date.parse(lastRescue.created_at) < preference.cooldown_minutes*60000) {
      await updateRuleState(admin,preference.user_id,"cooldown",{...rule.detail,cooldown_minutes:preference.cooldown_minutes});
      outcomes.push("cooldown");
      return outcomes;
    }
  }

  const copy = rescueCopy(selected,stage);
  const questIds = selected.map(candidate=>candidate.quest.id);
  const dedupeSuffix = stage === "final" ? "" : `:${questIds.slice().sort().join(",")}`;
  const dedupeKey = `streak_rescue:${stage}:${local.dateKey}${dedupeSuffix}`;
  const ttlSeconds = Math.max(15*60,Math.min(4*60*60,minutesUntil(local.minuteOfDay,timeMinutes(preference.quiet_start))*60));
  const detail = {
    ...rule.detail,stage,quest_ids:questIds,candidate_count:selected.length,
    streaks:selected.map(candidate=>({quest_id:candidate.quest.id,streak:candidate.streak,overdue_minutes:candidate.overdueMinutes}))
  };
  const outcome = await queueNotification(
    admin,preference,subscriptions,"streak_rescue",local.dateKey,dedupeKey,
    copy.title,copy.body,notificationPayload(copy.title,copy.body,dedupeKey,"./index.html#today",ttlSeconds),detail,
    selected.length === 1 ? selected[0].quest.id : null
  );
  await updateRuleState(admin,preference.user_id,outcome === "queued" ? `queued_${stage}` : outcome,detail);
  outcomes.push(outcome === "queued" ? `rescue_${stage}_queued` : outcome);
  return outcomes;
}

async function syncOutboxStatus(admin:DatabaseClient,notificationId:string) {
  const {data:deliveries,error} = await admin
    .from("level90_notification_deliveries").select("status,sent_at")
    .eq("notification_id",notificationId);
  if (error) throw error;
  const statuses = deliveries || [];
  const sent = statuses.filter(delivery=>delivery.status === "sent");
  const waiting = statuses.some(delivery=>delivery.status === "pending" || delivery.status === "retry" || delivery.status === "sending");
  const cancelled = statuses.length > 0 && statuses.every(delivery=>delivery.status === "cancelled");
  const status = waiting ? "pending" : sent.length ? "sent" : cancelled ? "cancelled" : "failed";
  const sentAt = sent.map(delivery=>delivery.sent_at).filter(Boolean).sort()[0] || null;
  await admin.from("level90_notification_outbox").update({
    status,sent_count:sent.length,sent_at:sentAt
  }).eq("id",notificationId);
}

async function processPendingDeliveries(admin:DatabaseClient,now:Date,userId:string | null=null) {
  let interrupted = admin.from("level90_notification_deliveries").update({
    status:"retry",last_error:"Recovered an interrupted delivery"
  }).eq("status","sending").lte("updated_at",new Date(now.getTime()-10*60000).toISOString());
  if (userId) interrupted = interrupted.eq("user_id",userId);
  await interrupted;

  let deliveryQuery = admin
    .from("level90_notification_deliveries")
    .select("id,user_id,notification_id,subscription_id,attempt_count")
    .in("status",["pending","retry"]).lte("next_attempt_at",now.toISOString());
  if (userId) deliveryQuery = deliveryQuery.eq("user_id",userId);
  const {data:deliveries,error} = await deliveryQuery.order("next_attempt_at",{ascending:true}).limit(100);
  if (error) throw error;
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const delivery of deliveries || []) {
    const {data:claim,error:claimError} = await admin
      .from("level90_notification_deliveries")
      .update({status:"sending",next_attempt_at:new Date(now.getTime()+10*60000).toISOString()})
      .eq("id",delivery.id).in("status",["pending","retry"]).select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claim) continue;
    const [{data:preference},{data:subscription},{data:notification}] = await Promise.all([
      admin.from("level90_notification_preferences").select("smart_enabled,morning_brief_enabled,evening_recap_enabled,streak_rescue_enabled").eq("user_id",delivery.user_id).maybeSingle(),
      admin.from("level90_push_subscriptions").select("id,endpoint,p256dh,auth,enabled").eq("user_id",delivery.user_id).eq("id",delivery.subscription_id).maybeSingle(),
      admin.from("level90_notification_outbox").select("payload,quest_id,local_date,status,rule_key").eq("id",delivery.notification_id).maybeSingle()
    ]);
    const laneEnabled = notification?.rule_key === "morning_brief" ? preference?.morning_brief_enabled
      : notification?.rule_key === "evening_recap" ? preference?.evening_recap_enabled
      : preference?.streak_rescue_enabled;
    if (!preference?.smart_enabled || !laneEnabled) {
      await admin.from("level90_notification_deliveries").update({status:"cancelled",last_error:"Notification rule disabled"}).eq("id",delivery.id);
      await syncOutboxStatus(admin,delivery.notification_id);
      continue;
    }
    if (notification?.status === "cancelled") {
      await admin.from("level90_notification_deliveries").update({status:"cancelled",last_error:"Notification cancelled"}).eq("id",delivery.id);
      await syncOutboxStatus(admin,delivery.notification_id);
      continue;
    }
    if (!subscription?.enabled || !notification?.payload) {
      await admin.from("level90_notification_deliveries").update({status:"invalid",last_error:"Device unavailable"}).eq("id",delivery.id);
      await syncOutboxStatus(admin,delivery.notification_id);
      failed += 1;
      continue;
    }
    if (notification.quest_id && notification.local_date) {
      const {data:completion} = await admin
        .from("level90_completions").select("id")
        .eq("user_id",delivery.user_id).eq("quest_id",notification.quest_id)
        .eq("completion_date",notification.local_date).is("deleted_at",null).maybeSingle();
      if (completion) {
        await admin.from("level90_notification_deliveries").update({status:"cancelled",last_error:"Quest completed before delivery"}).eq("id",delivery.id);
        await syncOutboxStatus(admin,delivery.notification_id);
        continue;
      }
    }

    const attemptCount = Number(delivery.attempt_count || 0)+1;
    const pushPayload = notification.payload as NotificationPayload;
    const ttlSeconds = Math.max(60,Math.min(12*60*60,Number(pushPayload.ttlSeconds || 3600)));
    try {
      await webPush.sendNotification({
        endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}
      },JSON.stringify(pushPayload),{TTL:ttlSeconds,urgency:notification.rule_key === "streak_rescue" ? "high" : "normal"});
      await admin.from("level90_notification_deliveries").update({
        status:"sent",attempt_count:attemptCount,sent_at:new Date().toISOString(),last_error:null
      }).eq("id",delivery.id);
      sent += 1;
    } catch (sendError) {
      const statusCode = Number((sendError as {statusCode?:number})?.statusCode || 0);
      const message = sendError instanceof Error ? sendError.message.slice(0,500) : "Push delivery failed";
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("level90_push_subscriptions").update({enabled:false}).eq("user_id",delivery.user_id).eq("id",delivery.subscription_id);
        await admin.from("level90_notification_deliveries").update({status:"invalid",attempt_count:attemptCount,last_error:message}).eq("id",delivery.id);
        failed += 1;
      } else if (attemptCount >= 3) {
        await admin.from("level90_notification_deliveries").update({status:"failed",attempt_count:attemptCount,last_error:message}).eq("id",delivery.id);
        failed += 1;
      } else {
        const retryMinutes = attemptCount === 1 ? 5 : 20;
        await admin.from("level90_notification_deliveries").update({
          status:"retry",attempt_count:attemptCount,last_error:message,
          next_attempt_at:new Date(now.getTime()+retryMinutes*60000).toISOString()
        }).eq("id",delivery.id);
        retried += 1;
      }
    }
    await syncOutboxStatus(admin,delivery.notification_id);
  }
  return {sent,retried,failed,processed:(deliveries || []).length};
}

async function dispatchSmartNotifications(admin:DatabaseClient,now=new Date(),userId:string | null=null) {
  let preferenceQuery = admin
    .from("level90_notification_preferences")
    .select("user_id,timezone,smart_enabled,morning_brief_enabled,morning_brief_time,evening_recap_enabled,evening_recap_time,streak_rescue_enabled,rescue_intensity,final_rescue_time,quiet_start,quiet_end,max_daily,min_streak,adaptive_grace_minutes,cooldown_minutes")
    .eq("smart_enabled",true);
  if (userId) preferenceQuery = preferenceQuery.eq("user_id",userId);
  const {data:preferences,error} = await preferenceQuery.limit(userId ? 1 : 500);
  if (error) throw error;
  const outcomes:Record<string,number> = {};
  for (const preference of (preferences || []) as SmartPreference[]) {
    try {
      const userOutcomes = await evaluateSmartUser(admin,preference,now);
      userOutcomes.forEach(outcome=>{ outcomes[outcome] = (outcomes[outcome] || 0)+1; });
    } catch (evaluationError) {
      outcomes.error = (outcomes.error || 0)+1;
      await updateRuleState(admin,preference.user_id,"error",{
        message:evaluationError instanceof Error ? evaluationError.message.slice(0,300) : "Evaluation failed"
      });
    }
  }
  const deliveries = await processPendingDeliveries(admin,now,userId);
  return {users:(preferences || []).length,outcomes,deliveries};
}

Deno.serve(async request=>{
  if (request.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
  if (request.method !== "POST") return json({error:"Method not allowed."},405);

  let payload:{action?:string;subscriptionId?:string};
  try { payload = await request.json(); }
  catch { return json({error:"Invalid request body."},400); }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = bundledEnvironmentKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
  const secretKey = bundledEnvironmentKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!supabaseUrl || !publishableKey) return json({error:"Supabase function environment is incomplete."},503);
  if (!publicKey || !privateKey || !subject) {
    return json({error:"Notification server setup incomplete: add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT secrets."},503);
  }
  webPush.setVapidDetails(subject,publicKey,privateKey);

  if (payload.action === "dispatch") {
    const expectedSecret = Deno.env.get("LEVEL90_DISPATCH_SECRET");
    const suppliedSecret = request.headers.get("x-level90-dispatch-secret");
    if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) return json({error:"Dispatch authentication failed."},401);
    if (!secretKey) return json({error:"Supabase server key is unavailable to the notification dispatcher."},503);
    const admin = createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
    try {
      return json(await dispatchSmartNotifications(admin));
    } catch (dispatchError) {
      return json({error:dispatchError instanceof Error ? dispatchError.message : "Smart notification dispatch failed."},500);
    }
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({error:"Authentication required."},401);
  const supabase = createClient(supabaseUrl,publishableKey,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error:userError} = await supabase.auth.getUser();
  if (userError || !user) return json({error:"Your Level90 session is not valid."},401);

  if (payload.action === "config") return json({publicKey,smartRuleVersion:2});
  if (payload.action === "catchup") {
    if (!secretKey) return json({error:"Supabase server key is unavailable for notification catch-up."},503);
    const admin = createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
    try {
      return json(await dispatchSmartNotifications(admin,new Date(),user.id));
    } catch (catchupError) {
      return json({error:catchupError instanceof Error ? catchupError.message : "Notification catch-up failed."},500);
    }
  }
  if (payload.action !== "test") return json({error:"Unsupported notification action."},400);
  if (!payload.subscriptionId) return json({error:"A notification device is required."},400);

  const {data:subscription,error:subscriptionError} = await supabase
    .from("level90_push_subscriptions")
    .select("id, endpoint, p256dh, auth, device_name, enabled")
    .eq("user_id",user.id).eq("id",payload.subscriptionId).eq("enabled",true).single();
  if (subscriptionError || !subscription) return json({error:"This notification device is not registered."},404);

  const notification:NotificationPayload = {
    title:"Level90 is connected 🔥",
    body:`Test successful on ${subscription.device_name}. Briefings, recaps and streak rescue are ready.`,
    icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",
    tag:`level90-test-${Date.now()}`,url:"./index.html#today"
  };
  try {
    await webPush.sendNotification({
      endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}
    },JSON.stringify(notification),{TTL:60,urgency:"normal"});
    return json({sent:true,device:subscription.device_name});
  } catch (sendError) {
    const statusCode = Number((sendError as {statusCode?:number})?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await supabase.from("level90_push_subscriptions").update({enabled:false}).eq("user_id",user.id).eq("id",subscription.id);
    }
    const message = sendError instanceof Error ? sendError.message : "The push service rejected the notification.";
    return json({error:message},statusCode >= 400 && statusCode < 600 ? statusCode : 502);
  }
});
