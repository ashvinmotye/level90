"use strict";

const LEVEL90_NOTIFICATION_FUNCTION = "level90-notifications";
const LEVEL90_NOTIFICATION_DEVICE_NAME_PREFIX = "level90.notificationDeviceName.v1";

const level90NotificationDom = {
  supportStatus:document.querySelector("#notificationSupportStatus"),
  statusTitle:document.querySelector("#notificationStatusTitle"),
  statusText:document.querySelector("#notificationStatusText"),
  deviceName:document.querySelector("#notificationDeviceNameInput"),
  enableButton:document.querySelector("#enableNotificationsButton"),
  testButton:document.querySelector("#testNotificationButton"),
  disableButton:document.querySelector("#disableNotificationsButton"),
  message:document.querySelector("#notificationMessage"),
  smartStatus:document.querySelector("#smartNotificationStatus"),
  smartToggle:document.querySelector("#smartNotificationsToggle"),
  smartMinimumStreak:document.querySelector("#smartMinimumStreak"),
  smartDailyLimit:document.querySelector("#smartDailyLimit"),
  smartQuietStart:document.querySelector("#smartQuietStart"),
  smartQuietEnd:document.querySelector("#smartQuietEnd"),
  smartTimezone:document.querySelector("#smartTimezoneLabel"),
  smartRuleState:document.querySelector("#smartRuleState"),
  smartSaveButton:document.querySelector("#saveSmartNotificationSettingsButton"),
  smartHistory:document.querySelector("#smartNotificationHistory"),
  smartMessage:document.querySelector("#smartNotificationMessage")
};

let level90NotificationPublicKey = null;
let level90NotificationConfigPromise = null;
let level90NotificationBusy = false;
let level90NotificationBound = false;
let level90NotificationSmartRuleVersion = 0;
let level90SmartSettingsBusy = false;

function level90NotificationUser() {
  return typeof level90AuthSession !== "undefined" ? level90AuthSession?.user || null : null;
}

function level90NotificationDeviceKey(userId=level90NotificationUser()?.id) {
  return userId ? `${LEVEL90_NOTIFICATION_DEVICE_NAME_PREFIX}.${userId}` : null;
}

function level90DetectedDeviceName() {
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? "Android phone" : "Android tablet";
  if (/Mac/i.test(platform)) return "Mac";
  if (/Win/i.test(platform)) return "Windows laptop";
  if (/Linux/i.test(platform)) return "Linux computer";
  return "Level90 device";
}

function level90NotificationDeviceName() {
  const key = level90NotificationDeviceKey();
  return (key && localStorage.getItem(key)) || level90DetectedDeviceName();
}

function level90NotificationPlatform() {
  return String(navigator.userAgentData?.platform || navigator.platform || "Web").slice(0,60);
}

function level90NotificationSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return {supported:false,reason:"This browser does not support Web Push notifications."};
  }
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  if (isiOS && !standalone) {
    return {supported:false,installRequired:true,reason:"Add Level90 to your Home Screen, then open the installed app to enable notifications."};
  }
  return {supported:true};
}

function level90SetNotificationBadge(label,state="") {
  if (!level90NotificationDom.supportStatus) return;
  level90NotificationDom.supportStatus.textContent = label;
  level90NotificationDom.supportStatus.classList.toggle("is-offline",state !== "success");
}

function level90SetNotificationState(title,text,badge="Checking",state="") {
  if (level90NotificationDom.statusTitle) level90NotificationDom.statusTitle.textContent = title;
  if (level90NotificationDom.statusText) level90NotificationDom.statusText.textContent = text;
  level90SetNotificationBadge(badge,state);
}

function level90SetNotificationMessage(message="",isError=false) {
  if (!level90NotificationDom.message) return;
  level90NotificationDom.message.textContent = message;
  level90NotificationDom.message.classList.toggle("is-error",isError);
}

function level90SetSmartNotificationMessage(message="",isError=false) {
  if (!level90NotificationDom.smartMessage) return;
  level90NotificationDom.smartMessage.textContent = message;
  level90NotificationDom.smartMessage.classList.toggle("is-error",isError);
}

function level90SetSmartNotificationBadge(label,state="") {
  if (!level90NotificationDom.smartStatus) return;
  level90NotificationDom.smartStatus.textContent = label;
  level90NotificationDom.smartStatus.classList.toggle("is-offline",state !== "success");
}

function level90SetSmartControlsEnabled(enabled) {
  [
    level90NotificationDom.smartToggle,level90NotificationDom.smartMinimumStreak,
    level90NotificationDom.smartDailyLimit,level90NotificationDom.smartQuietStart,
    level90NotificationDom.smartQuietEnd,level90NotificationDom.smartSaveButton
  ].filter(Boolean).forEach(control=>{ control.disabled = !enabled || level90SmartSettingsBusy; });
}

function level90DisableSmartSettings(title="Smart reminders unavailable",message="Connect this device before enabling contextual reminders.") {
  level90SetSmartControlsEnabled(false);
  level90SetSmartNotificationBadge(title);
  if (level90NotificationDom.smartRuleState) level90NotificationDom.smartRuleState.textContent = message;
  if (level90NotificationDom.smartHistory) level90NotificationDom.smartHistory.innerHTML = "<small>No smart reminders sent yet.</small>";
}

function level90SetNotificationBusy(busy,label="") {
  level90NotificationBusy = busy;
  if (level90NotificationDom.enableButton && label) level90NotificationDom.enableButton.textContent = label;
  [level90NotificationDom.enableButton,level90NotificationDom.testButton,level90NotificationDom.disableButton]
    .filter(Boolean).forEach(button=>{ button.disabled = busy || button.disabled; });
}

function level90ResetNotificationButtonLabels() {
  if (level90NotificationDom.enableButton) level90NotificationDom.enableButton.textContent = "Enable notifications";
  if (level90NotificationDom.testButton) level90NotificationDom.testButton.textContent = "Send test";
  if (level90NotificationDom.disableButton) level90NotificationDom.disableButton.textContent = "Disconnect";
}

async function level90NotificationFunctionError(error) {
  try {
    const payload = await error?.context?.clone?.().json();
    if (payload?.error) return String(payload.error);
  } catch {}
  return String(error?.message || "The notification service could not be reached.");
}

function level90FriendlyNotificationError(error) {
  const message = String(error?.message || error || "").trim();
  const normalized = message.toLowerCase();
  if (!navigator.onLine || normalized.includes("failed to fetch") || normalized.includes("network")) return "Connect to the internet and try again.";
  if (normalized.includes("min_streak") || normalized.includes("notification_outbox") || normalized.includes("last_evaluated_at")) return "Run the included Level90 Phase 2 smart-notification migration in Supabase.";
  if (normalized.includes("level90_push_subscriptions") || normalized.includes("schema cache") || normalized.includes("relation")) return "Run the included Level90 notification migration in Supabase.";
  if (normalized.includes("function") && (normalized.includes("not found") || normalized.includes("non-2xx"))) return "Deploy the included Level90 notification Edge Function.";
  if (normalized.includes("setup incomplete") || normalized.includes("vapid")) return "Add the three VAPID secrets to the Level90 notification Edge Function.";
  return message || "Notifications could not be configured.";
}

async function level90InvokeNotificationFunction(action,extra={}) {
  if (!level90AuthClient || !level90NotificationUser()) throw new Error("Sign in before configuring notifications.");
  const {data,error} = await level90AuthClient.functions.invoke(LEVEL90_NOTIFICATION_FUNCTION,{body:{action,...extra}});
  if (error) throw new Error(await level90NotificationFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data || {};
}

async function level90LoadNotificationConfig(force=false) {
  if (level90NotificationPublicKey && !force) return level90NotificationPublicKey;
  if (level90NotificationConfigPromise && !force) return level90NotificationConfigPromise;
  level90NotificationConfigPromise = (async()=>{
    const data = await level90InvokeNotificationFunction("config");
    if (!data.publicKey) throw new Error("Notification server setup incomplete: VAPID public key is missing.");
    level90NotificationPublicKey = data.publicKey;
    level90NotificationSmartRuleVersion = Number(data.smartRuleVersion || 0);
    return level90NotificationPublicKey;
  })();
  try {
    return await level90NotificationConfigPromise;
  } finally {
    level90NotificationConfigPromise = null;
  }
}

function level90TimeInputValue(value,fallback) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function level90SmartRuleStateText(preference) {
  if (!preference.smart_enabled) return "Smart reminders are paused.";
  if (!preference.last_evaluated_at) {
    const enabledAgeMinutes = Math.max(0,Math.round((Date.now()-Date.parse(preference.updated_at || new Date().toISOString()))/60000));
    return enabledAgeMinutes > 35
      ? "No scheduler check has arrived yet. Review the Level90 Cron job in Supabase."
      : "Waiting for the first scheduled rule check.";
  }
  const ageMinutes = Math.max(0,Math.round((Date.now()-Date.parse(preference.last_evaluated_at))/60000));
  if (ageMinutes > 35) return `The scheduler last checked ${ageMinutes} minutes ago. Review the Cron job if this persists.`;
  const detail = preference.last_rule_detail || {};
  const messages = {
    quiet_hours:"Last check: quiet hours are active, so Level90 stayed silent.",
    no_at_risk_streak:"Last check: no qualifying streak is currently at risk.",
    before_adaptive_time:`Monitoring your streak. The earliest contextual check is ${detail.next_trigger_local || "later today"}.`,
    daily_limit:"Today's reminder limit has already been reached.",
    cooldown:"Level90 is respecting the four-hour reminder cooldown.",
    queued:"A streak-rescue reminder was queued for delivery.",
    already_queued:"Today's reminder for that quest was already handled.",
    no_device:"No connected notification device was found.",
    error:"The last rule check failed. Open the Edge Function logs for details."
  };
  return messages[preference.last_rule_result] || "The smart rule scheduler is active.";
}

function level90RenderSmartHistory(items=[]) {
  if (!level90NotificationDom.smartHistory) return;
  if (!items.length) {
    level90NotificationDom.smartHistory.innerHTML = "<small>No smart reminders sent yet.</small>";
    return;
  }
  level90NotificationDom.smartHistory.innerHTML = items.map(item=>{
    const when = new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(item.sent_at || item.created_at));
    const status = item.status === "sent" ? "Delivered" : item.status === "pending" ? "Pending" : item.status;
    return `<div class="smart-history-item"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></div><small>${escapeHtml(status)} · ${escapeHtml(when)}</small></div>`;
  }).join("");
}

async function level90LoadSmartNotificationSettings() {
  const user = level90NotificationUser();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (level90NotificationDom.smartTimezone) level90NotificationDom.smartTimezone.textContent = `Timezone: ${timezone}`;
  if (!user) {
    level90DisableSmartSettings("Signed out","Sign in to manage smart reminders.");
    return;
  }
  if (level90NotificationSmartRuleVersion < 1) {
    level90DisableSmartSettings("Update required","Deploy the updated Level90 notification Edge Function for Phase 2.");
    return;
  }
  const {data:preference,error} = await level90AuthClient
    .from("level90_notification_preferences")
    .select("timezone,smart_enabled,streak_rescue_enabled,quiet_start,quiet_end,max_daily,min_streak,adaptive_grace_minutes,cooldown_minutes,last_evaluated_at,last_rule_result,last_rule_detail,updated_at")
    .eq("user_id",user.id)
    .maybeSingle();
  if (error) throw error;
  if (!preference) throw new Error("The Level90 notification preference record is missing.");
  level90NotificationDom.smartToggle.checked = Boolean(preference.smart_enabled);
  level90NotificationDom.smartMinimumStreak.value = String(preference.min_streak || 3);
  level90NotificationDom.smartDailyLimit.value = String(preference.max_daily || 2);
  level90NotificationDom.smartQuietStart.value = level90TimeInputValue(preference.quiet_start,"21:30");
  level90NotificationDom.smartQuietEnd.value = level90TimeInputValue(preference.quiet_end,"08:00");
  level90SetSmartControlsEnabled(true);
  level90SetSmartNotificationBadge(preference.smart_enabled ? "Active" : "Paused",preference.smart_enabled ? "success" : "");
  if (level90NotificationDom.smartRuleState) level90NotificationDom.smartRuleState.textContent = level90SmartRuleStateText(preference);

  const {data:history,error:historyError} = await level90AuthClient
    .from("level90_notification_outbox")
    .select("id,title,body,status,created_at,sent_at")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false})
    .limit(3);
  if (historyError) throw historyError;
  level90RenderSmartHistory(history || []);
}

async function level90RefreshSmartNotificationSettings(connected=false) {
  if (!level90NotificationDom.smartStatus) return;
  if (!connected) {
    level90DisableSmartSettings();
    return;
  }
  try {
    await level90LoadSmartNotificationSettings();
    level90SetSmartNotificationMessage();
  } catch (error) {
    const message = level90FriendlyNotificationError(error);
    level90DisableSmartSettings("Setup needed",message);
    level90SetSmartNotificationMessage(message,true);
  }
}

async function level90SaveSmartNotificationSettings() {
  if (level90SmartSettingsBusy || !level90NotificationUser()) return;
  level90SmartSettingsBusy = true;
  level90SetSmartControlsEnabled(false);
  level90NotificationDom.smartSaveButton.textContent = "Saving…";
  level90SetSmartNotificationMessage();
  let resultMessage = "";
  let resultIsError = false;
  try {
    const user = level90NotificationUser();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const record = {
      user_id:user.id,timezone,
      smart_enabled:Boolean(level90NotificationDom.smartToggle.checked),
      streak_rescue_enabled:true,
      min_streak:Number(level90NotificationDom.smartMinimumStreak.value || 3),
      max_daily:Number(level90NotificationDom.smartDailyLimit.value || 2),
      quiet_start:level90NotificationDom.smartQuietStart.value || "21:30",
      quiet_end:level90NotificationDom.smartQuietEnd.value || "08:00",
      adaptive_grace_minutes:60,cooldown_minutes:240
    };
    const {error} = await level90AuthClient.from("level90_notification_preferences").upsert(record,{onConflict:"user_id"});
    if (error) throw error;
    resultMessage = record.smart_enabled ? "Smart streak rescue is active." : "Smart reminders are paused.";
    showToast(resultMessage);
  } catch (error) {
    resultMessage = level90FriendlyNotificationError(error);
    resultIsError = true;
  } finally {
    level90SmartSettingsBusy = false;
    level90NotificationDom.smartSaveButton.textContent = "Save smart settings";
    await level90RefreshSmartNotificationSettings(true);
    level90SetSmartNotificationMessage(resultMessage,resultIsError);
  }
}

function level90UrlBase64ToUint8Array(value) {
  const padding = "=".repeat((4-value.length%4)%4);
  const base64 = (value+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(character=>character.charCodeAt(0)));
}

function level90ArrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach(byte=>{ binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function level90PushSubscriptionId(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(endpoint));
  return `push_${[...new Uint8Array(digest)].slice(0,16).map(byte=>byte.toString(16).padStart(2,"0")).join("")}`;
}

async function level90StorePushSubscription(subscription) {
  const user = level90NotificationUser();
  if (!user) throw new Error("Sign in before registering this device.");
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh || (subscription.getKey("p256dh") ? level90ArrayBufferToBase64Url(subscription.getKey("p256dh")) : "");
  const auth = serialized.keys?.auth || (subscription.getKey("auth") ? level90ArrayBufferToBase64Url(subscription.getKey("auth")) : "");
  if (!serialized.endpoint || !p256dh || !auth) throw new Error("The browser returned an incomplete push subscription.");
  const id = await level90PushSubscriptionId(serialized.endpoint);
  const deviceName = (level90NotificationDom.deviceName?.value || level90NotificationDeviceName()).trim().slice(0,40) || level90DetectedDeviceName();
  const now = new Date().toISOString();
  const {error} = await level90AuthClient.from("level90_push_subscriptions").upsert({
    user_id:user.id,id,endpoint:serialized.endpoint,p256dh,auth,device_name:deviceName,
    platform:level90NotificationPlatform(),enabled:true,last_seen_at:now
  },{onConflict:"user_id,id"});
  if (error) throw error;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const preferenceResponse = await level90AuthClient.from("level90_notification_preferences").upsert({user_id:user.id,timezone},{onConflict:"user_id"});
  if (preferenceResponse.error) throw preferenceResponse.error;
  const deviceKey = level90NotificationDeviceKey(user.id);
  if (deviceKey) localStorage.setItem(deviceKey,deviceName);
  return id;
}

async function level90CurrentPushSubscription() {
  if (!level90NotificationSupport().supported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function refreshLevel90NotificationSettings() {
  if (!level90NotificationDom.statusTitle) return;
  const support = level90NotificationSupport();
  const user = level90NotificationUser();
  level90ResetNotificationButtonLabels();
  if (level90NotificationDom.deviceName) level90NotificationDom.deviceName.value = level90NotificationDeviceName();
  [level90NotificationDom.enableButton,level90NotificationDom.testButton,level90NotificationDom.disableButton]
    .filter(Boolean).forEach(button=>{ button.disabled = true; });
  level90DisableSmartSettings("Checking","Checking this device and the smart notification service…");

  if (!support.supported) {
    level90SetNotificationState(support.installRequired ? "Install Level90 first" : "Notifications unavailable",support.reason,support.installRequired ? "Install app" : "Unsupported");
    level90DisableSmartSettings(support.installRequired ? "Install app" : "Unsupported",support.reason);
    return;
  }
  if (!user) {
    level90SetNotificationState("Sign in required","Your notification devices are linked to your Level90 account.","Signed out");
    level90DisableSmartSettings("Signed out","Sign in to manage smart reminders.");
    return;
  }
  if (!navigator.onLine) {
    level90SetNotificationState("Offline","Connect to check or change this device's notification status.","Offline");
    level90DisableSmartSettings("Offline","Connect to check or change smart reminders.");
    return;
  }

  level90SetNotificationState("Preparing notification service","Checking the secure push configuration…","Checking");
  try {
    await level90LoadNotificationConfig();
  } catch (error) {
    level90SetNotificationState("Notification setup required",level90FriendlyNotificationError(error),"Setup needed");
    level90SetNotificationMessage(level90FriendlyNotificationError(error),true);
    level90DisableSmartSettings("Setup needed",level90FriendlyNotificationError(error));
    return;
  }

  const permission = Notification.permission;
  if (permission === "denied") {
    level90SetNotificationState("Notifications are blocked","Allow Level90 notifications in your device or browser settings, then return here.","Blocked");
    level90DisableSmartSettings("Blocked","Allow notifications before enabling smart reminders.");
    return;
  }

  try {
    const subscription = await level90CurrentPushSubscription();
    if (subscription) {
      await level90StorePushSubscription(subscription);
      level90SetNotificationState("This device is connected","Level90 can send a test notification to this device.","Connected","success");
      level90NotificationDom.testButton.disabled = level90NotificationBusy;
      level90NotificationDom.disableButton.disabled = level90NotificationBusy;
    } else {
      const text = permission === "granted"
        ? "Permission is granted. Connect this device to finish notification setup."
        : "Connect this device when you are ready. Level90 will ask for permission once.";
      level90SetNotificationState("Ready to connect",text,"Ready","success");
      level90NotificationDom.enableButton.disabled = level90NotificationBusy;
    }
    level90SetNotificationMessage();
    await level90RefreshSmartNotificationSettings(Boolean(subscription));
  } catch (error) {
    level90SetNotificationState("Device registration incomplete",level90FriendlyNotificationError(error),"Setup needed");
    level90SetNotificationMessage(level90FriendlyNotificationError(error),true);
    level90DisableSmartSettings("Setup needed",level90FriendlyNotificationError(error));
  }
}

async function level90EnableNotifications() {
  if (level90NotificationBusy || !level90NotificationPublicKey) return;
  const permissionPromise = Notification.permission === "default"
    ? Notification.requestPermission()
    : Promise.resolve(Notification.permission);
  level90SetNotificationBusy(true,"Connecting…");
  level90SetNotificationMessage();
  try {
    const permission = await permissionPromise;
    if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications were blocked. Enable them in your device settings." : "Notification permission was not granted.");
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:level90UrlBase64ToUint8Array(level90NotificationPublicKey)
      });
    }
    await level90StorePushSubscription(subscription);
    showToast("Notifications connected.");
  } catch (error) {
    level90SetNotificationMessage(level90FriendlyNotificationError(error),true);
  } finally {
    level90NotificationBusy = false;
    await refreshLevel90NotificationSettings();
  }
}

async function level90SendTestNotification() {
  if (level90NotificationBusy) return;
  let resultMessage = "";
  let resultIsError = false;
  level90NotificationBusy = true;
  level90NotificationDom.testButton.textContent = "Sending…";
  level90NotificationDom.testButton.disabled = true;
  level90SetNotificationMessage();
  try {
    const subscription = await level90CurrentPushSubscription();
    if (!subscription) throw new Error("Connect this device before sending a test notification.");
    const subscriptionId = await level90StorePushSubscription(subscription);
    await level90InvokeNotificationFunction("test",{subscriptionId});
    resultMessage = "Test sent. It should appear like a normal device notification.";
    showToast("Test notification sent.");
  } catch (error) {
    resultMessage = level90FriendlyNotificationError(error);
    resultIsError = true;
  } finally {
    level90NotificationBusy = false;
    await refreshLevel90NotificationSettings();
    level90SetNotificationMessage(resultMessage,resultIsError);
  }
}

async function level90DisableNotifications() {
  if (level90NotificationBusy || !window.confirm("Disconnect notifications from this device? You can reconnect it later.")) return;
  let resultMessage = "";
  let resultIsError = false;
  level90NotificationBusy = true;
  level90NotificationDom.disableButton.textContent = "Disconnecting…";
  level90SetNotificationMessage();
  try {
    const subscription = await level90CurrentPushSubscription();
    if (subscription) {
      const id = await level90PushSubscriptionId(subscription.endpoint);
      const user = level90NotificationUser();
      const response = await level90AuthClient.from("level90_push_subscriptions").update({enabled:false,last_seen_at:new Date().toISOString()}).eq("user_id",user.id).eq("id",id);
      if (response.error) throw response.error;
      await subscription.unsubscribe();
    }
    resultMessage = "Notifications disconnected from this device.";
    showToast("Notifications disconnected.");
  } catch (error) {
    resultMessage = level90FriendlyNotificationError(error);
    resultIsError = true;
  } finally {
    level90NotificationBusy = false;
    await refreshLevel90NotificationSettings();
    level90SetNotificationMessage(resultMessage,resultIsError);
  }
}

async function level90UpdateNotificationDeviceName() {
  const key = level90NotificationDeviceKey();
  const value = (level90NotificationDom.deviceName?.value || "").trim().slice(0,40) || level90DetectedDeviceName();
  if (key) localStorage.setItem(key,value);
  try {
    const subscription = await level90CurrentPushSubscription();
    if (subscription) await level90StorePushSubscription(subscription);
  } catch (error) {
    level90SetNotificationMessage(level90FriendlyNotificationError(error),true);
  }
}

function level90BindNotificationSettings() {
  if (level90NotificationBound || !level90NotificationDom.enableButton) return;
  level90NotificationBound = true;
  level90NotificationDom.enableButton.addEventListener("click",level90EnableNotifications);
  level90NotificationDom.testButton.addEventListener("click",level90SendTestNotification);
  level90NotificationDom.disableButton.addEventListener("click",level90DisableNotifications);
  level90NotificationDom.deviceName.addEventListener("change",level90UpdateNotificationDeviceName);
  level90NotificationDom.smartSaveButton?.addEventListener("click",level90SaveSmartNotificationSettings);
  window.addEventListener("online",()=>refreshLevel90NotificationSettings().catch(()=>{}));
  window.addEventListener("offline",()=>refreshLevel90NotificationSettings().catch(()=>{}));
}

async function initializeLevel90Notifications() {
  level90BindNotificationSettings();
  await refreshLevel90NotificationSettings();
}

function resetLevel90NotificationSettings() {
  level90NotificationPublicKey = null;
  level90NotificationConfigPromise = null;
  level90NotificationBusy = false;
  level90NotificationSmartRuleVersion = 0;
  level90SmartSettingsBusy = false;
  level90ResetNotificationButtonLabels();
  level90DisableSmartSettings("Signed out","Sign in to manage smart reminders.");
  refreshLevel90NotificationSettings().catch(()=>{});
}

level90BindNotificationSettings();
