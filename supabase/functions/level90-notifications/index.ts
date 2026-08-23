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
type SmartPreference = {
  user_id:string;
  timezone:string;
  smart_enabled:boolean;
  streak_rescue_enabled:boolean;
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
};
type NotificationPayload = {
  title:string;
  body:string;
  icon:string;
  badge:string;
  tag:string;
  url:string;
};
type RuleResult = {
  result:string;
  detail:Record<string,unknown>;
  candidate?:{
    quest:QuestRecord;
    streak:number;
    triggerMinute:number;
    learnedTiming:boolean;
    sampleCount:number;
  };
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

  const waiting:Array<NonNullable<RuleResult["candidate"]>> = [];
  const eligible:Array<NonNullable<RuleResult["candidate"]>> = [];
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
    const candidate = {quest,streak,...timing};
    if (local.minuteOfDay >= timing.triggerMinute) eligible.push(candidate);
    else waiting.push(candidate);
  });

  const byPriority = (a:NonNullable<RuleResult["candidate"]>,b:NonNullable<RuleResult["candidate"]>) =>
    b.streak-a.streak || a.quest.sort_order-b.quest.sort_order;
  eligible.sort(byPriority);
  waiting.sort((a,b)=>a.triggerMinute-b.triggerMinute || byPriority(a,b));
  if (eligible[0]) {
    const candidate = eligible[0];
    return {
      result:"candidate",
      candidate,
      detail:{
        local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay),quest_id:candidate.quest.id,
        streak:candidate.streak,trigger_local:minuteLabel(candidate.triggerMinute),
        learned_timing:candidate.learnedTiming,sample_count:candidate.sampleCount
      }
    };
  }
  if (waiting[0]) {
    return {
      result:"before_adaptive_time",
      detail:{
        local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay),
        next_trigger_local:minuteLabel(waiting[0].triggerMinute),quest_id:waiting[0].quest.id,
        streak:waiting[0].streak,learned_timing:waiting[0].learnedTiming
      }
    };
  }
  return {result:"no_at_risk_streak",detail:{local_date:local.dateKey,local_time:minuteLabel(local.minuteOfDay)}};
}

async function updateRuleState(admin:DatabaseClient,userId:string,result:string,detail:Record<string,unknown>) {
  await admin.from("level90_notification_preferences").update({
    last_evaluated_at:new Date().toISOString(),last_rule_result:result,last_rule_detail:detail
  }).eq("user_id",userId);
}

async function evaluateSmartUser(admin:DatabaseClient,preference:SmartPreference,now:Date) {
  const {data:subscriptions,error:subscriptionError} = await admin
    .from("level90_push_subscriptions").select("id")
    .eq("user_id",preference.user_id).eq("enabled",true);
  if (subscriptionError) throw subscriptionError;
  if (!subscriptions?.length) {
    await updateRuleState(admin,preference.user_id,"no_device",{});
    return "no_device";
  }

  const {data:quests,error:questError} = await admin
    .from("level90_quests")
    .select("id,title,difficulty,quest_type,schedule,active,sort_order,created_on")
    .eq("user_id",preference.user_id).eq("quest_type","recurring")
    .eq("active",true).is("deleted_at",null);
  if (questError) throw questError;
  const localToday = zonedParts(now,preference.timezone).dateKey;
  const oldestCreatedOn = (quests || []).reduce((oldest,quest)=>quest.created_on < oldest ? quest.created_on : oldest,localToday);
  const {data:completions,error:completionError} = await admin
    .from("level90_completions")
    .select("quest_id,completion_date,completed_at")
    .eq("user_id",preference.user_id).gte("completion_date",oldestCreatedOn)
    .is("deleted_at",null);
  if (completionError) throw completionError;

  const rule = evaluateStreakRescue(preference,(quests || []) as QuestRecord[],(completions || []) as CompletionRecord[],now);
  if (!rule.candidate) {
    await updateRuleState(admin,preference.user_id,rule.result,rule.detail);
    return rule.result;
  }

  const localDate = String(rule.detail.local_date);
  const {count:dailyCount,error:countError} = await admin
    .from("level90_notification_outbox")
    .select("id",{count:"exact",head:true})
    .eq("user_id",preference.user_id).eq("local_date",localDate)
    .in("status",["pending","sent"]);
  if (countError) throw countError;
  if ((dailyCount || 0) >= preference.max_daily) {
    await updateRuleState(admin,preference.user_id,"daily_limit",{...rule.detail,max_daily:preference.max_daily});
    return "daily_limit";
  }

  const {data:lastNotification,error:lastError} = await admin
    .from("level90_notification_outbox").select("created_at")
    .eq("user_id",preference.user_id).in("status",["pending","sent"])
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (lastError) throw lastError;
  if (lastNotification && now.getTime()-Date.parse(lastNotification.created_at) < preference.cooldown_minutes*60000) {
    await updateRuleState(admin,preference.user_id,"cooldown",{...rule.detail,cooldown_minutes:preference.cooldown_minutes});
    return "cooldown";
  }

  const candidate = rule.candidate;
  const xp = difficultyXp[candidate.quest.difficulty] || 10;
  const title = `Protect your 🔥 ${candidate.streak} streak`;
  const body = `${candidate.quest.title} is still open · +${xp} XP`;
  const dedupeKey = `streak_rescue:${candidate.quest.id}:${localDate}`;
  const payload:NotificationPayload = {
    title,body,icon:"./icons/icon-192.png",badge:"./icons/icon-192.png",
    tag:`level90-${dedupeKey}`,url:"./index.html#today"
  };
  const {data:outbox,error:outboxError} = await admin
    .from("level90_notification_outbox")
    .insert({
      user_id:preference.user_id,rule_key:"streak_rescue",dedupe_key:dedupeKey,
      local_date:localDate,quest_id:candidate.quest.id,title,body,payload,reason:rule.detail,
      target_count:subscriptions.length
    }).select("id").single();
  if (outboxError) {
    if (outboxError.code === "23505") {
      await updateRuleState(admin,preference.user_id,"already_queued",rule.detail);
      return "already_queued";
    }
    throw outboxError;
  }
  const {error:deliveryError} = await admin.from("level90_notification_deliveries").insert(
    subscriptions.map(subscription=>({
      notification_id:outbox.id,user_id:preference.user_id,subscription_id:subscription.id
    }))
  );
  if (deliveryError) throw deliveryError;
  await updateRuleState(admin,preference.user_id,"queued",rule.detail);
  return "queued";
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

async function processPendingDeliveries(admin:DatabaseClient,now:Date) {
  await admin.from("level90_notification_deliveries").update({
    status:"retry",last_error:"Recovered an interrupted delivery"
  }).eq("status","sending").lte("updated_at",new Date(now.getTime()-10*60000).toISOString());
  const {data:deliveries,error} = await admin
    .from("level90_notification_deliveries")
    .select("id,user_id,notification_id,subscription_id,attempt_count")
    .in("status",["pending","retry"]).lte("next_attempt_at",now.toISOString())
    .order("next_attempt_at",{ascending:true}).limit(100);
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
    const {data:preference} = await admin
      .from("level90_notification_preferences").select("smart_enabled")
      .eq("user_id",delivery.user_id).maybeSingle();
    if (!preference?.smart_enabled) {
      await admin.from("level90_notification_deliveries").update({status:"cancelled",last_error:"Smart reminders disabled"}).eq("id",delivery.id);
      await syncOutboxStatus(admin,delivery.notification_id);
      continue;
    }
    const [{data:subscription},{data:notification}] = await Promise.all([
      admin.from("level90_push_subscriptions").select("id,endpoint,p256dh,auth,enabled").eq("user_id",delivery.user_id).eq("id",delivery.subscription_id).maybeSingle(),
      admin.from("level90_notification_outbox").select("payload,quest_id,local_date,status").eq("id",delivery.notification_id).maybeSingle()
    ]);
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
    try {
      await webPush.sendNotification({
        endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}
      },JSON.stringify(notification.payload),{TTL:3600,urgency:"normal"});
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

async function dispatchSmartNotifications(admin:DatabaseClient,now=new Date()) {
  const {data:preferences,error} = await admin
    .from("level90_notification_preferences")
    .select("user_id,timezone,smart_enabled,streak_rescue_enabled,quiet_start,quiet_end,max_daily,min_streak,adaptive_grace_minutes,cooldown_minutes")
    .eq("smart_enabled",true).eq("streak_rescue_enabled",true).limit(500);
  if (error) throw error;
  const outcomes:Record<string,number> = {};
  for (const preference of (preferences || []) as SmartPreference[]) {
    try {
      const outcome = await evaluateSmartUser(admin,preference,now);
      outcomes[outcome] = (outcomes[outcome] || 0)+1;
    } catch (evaluationError) {
      outcomes.error = (outcomes.error || 0)+1;
      await updateRuleState(admin,preference.user_id,"error",{
        message:evaluationError instanceof Error ? evaluationError.message.slice(0,300) : "Evaluation failed"
      });
    }
  }
  const deliveries = await processPendingDeliveries(admin,now);
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

  if (payload.action === "config") return json({publicKey,smartRuleVersion:1});
  if (payload.action !== "test") return json({error:"Unsupported notification action."},400);
  if (!payload.subscriptionId) return json({error:"A notification device is required."},400);

  const {data:subscription,error:subscriptionError} = await supabase
    .from("level90_push_subscriptions")
    .select("id, endpoint, p256dh, auth, device_name, enabled")
    .eq("user_id",user.id).eq("id",payload.subscriptionId).eq("enabled",true).single();
  if (subscriptionError || !subscription) return json({error:"This notification device is not registered."},404);

  const notification:NotificationPayload = {
    title:"Level90 is connected 🔥",
    body:`Test successful on ${subscription.device_name}. Smart streak rescue is ready.`,
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
