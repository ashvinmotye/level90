import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

function json(body:Record<string,unknown>,status=200) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"}
  });
}

Deno.serve(async request=>{
  if (request.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
  if (request.method !== "POST") return json({error:"Method not allowed."},405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!supabaseUrl || !anonKey) return json({error:"Supabase function environment is incomplete."},503);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({error:"Authentication required."},401);

  const supabase = createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error:userError} = await supabase.auth.getUser();
  if (userError || !user) return json({error:"Your Level90 session is not valid."},401);

  let payload:{action?:string;subscriptionId?:string};
  try { payload = await request.json(); }
  catch { return json({error:"Invalid request body."},400); }

  if (!publicKey || !privateKey || !subject) {
    return json({error:"Notification server setup incomplete: add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT secrets."},503);
  }

  if (payload.action === "config") return json({publicKey});
  if (payload.action !== "test") return json({error:"Unsupported notification action."},400);
  if (!payload.subscriptionId) return json({error:"A notification device is required."},400);

  const {data:subscription,error:subscriptionError} = await supabase
    .from("level90_push_subscriptions")
    .select("id, endpoint, p256dh, auth, device_name, enabled")
    .eq("user_id",user.id)
    .eq("id",payload.subscriptionId)
    .eq("enabled",true)
    .single();
  if (subscriptionError || !subscription) return json({error:"This notification device is not registered."},404);

  webPush.setVapidDetails(subject,publicKey,privateKey);
  const notification = JSON.stringify({
    title:"Level90 is connected 🔥",
    body:`Test successful on ${subscription.device_name}. Smart quest reminders can be added next.`,
    icon:"./icons/icon-192.png",
    badge:"./icons/icon-192.png",
    tag:`level90-test-${Date.now()}`,
    url:"./index.html#today"
  });

  try {
    await webPush.sendNotification({
      endpoint:subscription.endpoint,
      keys:{p256dh:subscription.p256dh,auth:subscription.auth}
    },notification,{TTL:60,urgency:"normal"});
    return json({sent:true,device:subscription.device_name});
  } catch (error) {
    const statusCode = Number((error as {statusCode?:number})?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await supabase.from("level90_push_subscriptions").update({enabled:false}).eq("user_id",user.id).eq("id",subscription.id);
    }
    const message = error instanceof Error ? error.message : "The push service rejected the notification.";
    return json({error:message},statusCode >= 400 && statusCode < 600 ? statusCode : 502);
  }
});
