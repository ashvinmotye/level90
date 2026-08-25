"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");

const root = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(root,"notifications.js"),"utf8");

function element() {
  const classes = new Set();
  const listeners = new Map();
  return {
    disabled:false,textContent:"",value:"",dataset:{},
    classList:{
      toggle(name,force) {
        const add = force === undefined ? !classes.has(name) : force;
        if (add) classes.add(name); else classes.delete(name);
      },
      contains:name=>classes.has(name)
    },
    addEventListener(type,listener) { listeners.set(type,listener); },
    dispatch(type) { return listeners.get(type)?.({target:this}); }
  };
}

function storage() {
  const values = new Map();
  return {
    getItem:key=>values.has(key) ? values.get(key) : null,
    setItem:(key,value)=>values.set(key,String(value))
  };
}

function notificationContext({ios=false,standalone=true,smartRuleVersion=0}={}) {
  const elements = new Map();
  const writes = [];
  const invocations = [];
  const toasts = [];
  let currentSubscription = null;
  let requestCount = 0;
  let unsubscribeCount = 0;
  let smartPreference = {
    user_id:"user-a",timezone:"UTC",smart_enabled:false,streak_rescue_enabled:true,
    morning_brief_enabled:true,morning_brief_time:"10:00:00",
    evening_recap_enabled:true,evening_recap_time:"21:00:00",
    rescue_intensity:"aggressive",final_rescue_time:"20:15:00",
    quiet_start:"21:30:00",quiet_end:"08:00:00",max_daily:3,min_streak:3,
    adaptive_grace_minutes:30,cooldown_minutes:90,last_evaluated_at:null,
    last_rule_result:null,last_rule_detail:{}
  };

  const subscription = {
    endpoint:"https://push.example/subscription-a",
    toJSON() {
      return {endpoint:this.endpoint,keys:{p256dh:"p256dh-key",auth:"auth-key"}};
    },
    getKey(){ return null; },
    async unsubscribe() {
      unsubscribeCount += 1;
      currentSubscription = null;
      return true;
    }
  };
  const registration = {
    pushManager:{
      async getSubscription() { return currentSubscription; },
      async subscribe(options) {
        assert.equal(options.userVisibleOnly,true);
        assert.ok(options.applicationServerKey instanceof Uint8Array);
        currentSubscription = subscription;
        return subscription;
      }
    }
  };
  const notification = {
    permission:"default",
    async requestPermission() {
      requestCount += 1;
      this.permission = "granted";
      return this.permission;
    }
  };
  const client = {
    functions:{
      async invoke(_name,{body}) {
        invocations.push(body);
        if (body.action === "config") return {data:{publicKey:"AQIDBA",smartRuleVersion},error:null};
        if (body.action === "test") return {data:{sent:true},error:null};
        if (body.action === "catchup") return {data:{users:1,outcomes:{}},error:null};
        return {data:null,error:new Error("Unexpected action")};
      }
    },
    from(table) {
      return {
        async upsert(record,options) {
          writes.push({kind:"upsert",table,record,options});
          if (table === "level90_notification_preferences") smartPreference = {...smartPreference,...record};
          return {error:null};
        },
        select() {
          const query = {
            eq(){ return query; },
            order(){ return query; },
            maybeSingle() {
              return Promise.resolve({data:table === "level90_notification_preferences" ? smartPreference : null,error:null});
            },
            limit() {
              return Promise.resolve({data:table === "level90_notification_outbox" ? [] : null,error:null});
            }
          };
          return query;
        },
        update(record) {
          const query = {
            error:null,
            eq(column,value) {
              writes.push({kind:"filter",table,column,value,record});
              return query;
            }
          };
          return query;
        }
      };
    }
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector,element());
      return elements.get(selector);
    }
  };
  const navigator = {
    onLine:true,
    userAgent:ios ? "Mozilla/5.0 (iPhone)" : "Mozilla/5.0 (X11; Linux x86_64)",
    platform:ios ? "iPhone" : "Linux x86_64",
    maxTouchPoints:ios ? 5 : 0,
    serviceWorker:{ready:Promise.resolve(registration)}
  };
  const window = {
    Notification:notification,PushManager:function PushManager(){},
    matchMedia:()=>({matches:standalone}),
    atob:value=>Buffer.from(value,"base64").toString("binary"),
    btoa:value=>Buffer.from(value,"binary").toString("base64"),
    addEventListener(){},confirm:()=>true
  };
  const context = vm.createContext({
    console,document,navigator,window,Notification:notification,
    localStorage:storage(),crypto:webcrypto,TextEncoder,Uint8Array,
    Intl,Date,Promise,Buffer,
    level90AuthSession:{user:{id:"user-a",email:"ashvin@example.com"}},
    level90AuthClient:client,
    showToast:message=>toasts.push(message),
    escapeHtml:value=>String(value)
  });
  vm.runInContext(`${source}\n;globalThis.notificationApi={
    support:level90NotificationSupport,
    refresh:refreshLevel90NotificationSettings,
    enable:level90EnableNotifications,
    sendTest:level90SendTestNotification,
    disable:level90DisableNotifications,
    saveSmart:level90SaveSmartNotificationSettings
  };`,context);
  return {
    context,elements,writes,invocations,toasts,
    requestCount:()=>requestCount,
    unsubscribeCount:()=>unsubscribeCount
  };
}

async function run() {
  const harness = notificationContext();
  const {notificationApi} = harness.context;
  await notificationApi.refresh();
  assert.equal(harness.elements.get("#enableNotificationsButton").disabled,false);
  assert.equal(harness.elements.get("#testNotificationButton").disabled,true);
  assert.equal(harness.invocations.filter(item=>item.action === "config").length,1);

  await notificationApi.enable();
  assert.equal(harness.requestCount(),1,"permission should be requested exactly once");
  assert.equal(harness.elements.get("#testNotificationButton").disabled,false);
  assert.ok(harness.writes.some(write=>write.table === "level90_push_subscriptions" && write.kind === "upsert"));
  assert.ok(harness.writes.some(write=>write.table === "level90_notification_preferences" && write.kind === "upsert"));

  await notificationApi.sendTest();
  const testInvocation = harness.invocations.find(item=>item.action === "test");
  assert.match(testInvocation.subscriptionId,/^push_[a-f0-9]{32}$/);
  assert.match(harness.elements.get("#notificationMessage").textContent,/Test sent/);

  await notificationApi.disable();
  assert.equal(harness.unsubscribeCount(),1);
  assert.match(harness.elements.get("#notificationMessage").textContent,/disconnected/i);
  assert.ok(harness.writes.some(write=>write.kind === "filter" && write.table === "level90_push_subscriptions" && write.column === "user_id"));

  const iosHarness = notificationContext({ios:true,standalone:false});
  const iosSupport = iosHarness.context.notificationApi.support();
  assert.equal(iosSupport.supported,false);
  assert.equal(iosSupport.installRequired,true);

  const smartHarness = notificationContext({smartRuleVersion:2});
  await smartHarness.context.notificationApi.refresh();
  await smartHarness.context.notificationApi.enable();
  const smartToggle = smartHarness.elements.get("#smartNotificationsToggle");
  assert.equal(smartToggle.disabled,false,"smart settings should unlock after the device is connected");
  assert.equal(smartHarness.elements.get("#smartNotificationStatus").textContent,"Paused");
  assert.equal(smartHarness.elements.get('[data-time-display-for="morningBriefTime"]').textContent,"10:00");
  assert.equal(smartHarness.elements.get('[data-time-display-for="eveningRecapTime"]').textContent,"21:00");
  assert.equal(smartHarness.elements.get('[data-time-display-for="smartQuietStart"]').textContent,"21:30");
  assert.equal(smartHarness.elements.get('[data-time-display-for="smartQuietEnd"]').textContent,"08:00");
  smartToggle.checked = true;
  smartHarness.elements.get("#morningBriefToggle").checked = true;
  smartHarness.elements.get("#morningBriefTime").value = "09:45";
  smartHarness.elements.get("#eveningRecapToggle").checked = true;
  smartHarness.elements.get("#eveningRecapTime").value = "20:45";
  smartHarness.elements.get("#streakRescueToggle").checked = true;
  smartHarness.elements.get("#smartMinimumStreak").value = "5";
  smartHarness.elements.get("#smartRescueIntensity").value = "aggressive";
  smartHarness.elements.get("#smartQuietStart").value = "22:00";
  smartHarness.elements.get("#smartQuietEnd").value = "07:30";
  smartHarness.elements.get("#smartQuietStart").dispatch("change");
  smartHarness.elements.get("#smartQuietEnd").dispatch("change");
  smartHarness.elements.get("#morningBriefTime").dispatch("change");
  smartHarness.elements.get("#eveningRecapTime").dispatch("change");
  assert.equal(smartHarness.elements.get('[data-time-display-for="morningBriefTime"]').textContent,"09:45");
  assert.equal(smartHarness.elements.get('[data-time-display-for="eveningRecapTime"]').textContent,"20:45");
  assert.equal(smartHarness.elements.get('[data-time-display-for="smartQuietStart"]').textContent,"22:00");
  assert.equal(smartHarness.elements.get('[data-time-display-for="smartQuietEnd"]').textContent,"07:30");
  await smartHarness.context.notificationApi.saveSmart();
  const smartWrite = smartHarness.writes.filter(write=>write.table === "level90_notification_preferences" && write.record.smart_enabled === true).at(-1);
  assert.equal(smartWrite.record.min_streak,5);
  assert.equal(smartWrite.record.morning_brief_enabled,true);
  assert.equal(smartWrite.record.morning_brief_time,"09:45");
  assert.equal(smartWrite.record.evening_recap_time,"20:45");
  assert.equal(smartWrite.record.streak_rescue_enabled,true);
  assert.equal(smartWrite.record.rescue_intensity,"aggressive");
  assert.equal(smartWrite.record.max_daily,3);
  assert.equal(smartWrite.record.adaptive_grace_minutes,30);
  assert.equal(smartWrite.record.cooldown_minutes,90);
  assert.equal(smartWrite.record.quiet_start,"22:00");
  assert.equal(smartHarness.elements.get("#smartNotificationStatus").textContent,"Active");

  await runServiceWorkerTests();

  console.log("Level90 notification tests passed");
}

async function runServiceWorkerTests() {
  const listeners = new Map();
  const shown = [];
  const messages = [];
  let focused = 0;
  const client = {
    url:"https://level90.example/index.html#quests",
    async navigate(url) { this.url = url; return this; },
    postMessage(message) { messages.push(message); },
    async focus() { focused += 1; return this; }
  };
  const self = {
    registration:{
      scope:"https://level90.example/",
      async showNotification(title,options) { shown.push({title,options}); }
    },
    clients:{
      async matchAll() { return [client]; },
      async openWindow() { throw new Error("An existing Level90 window should be reused"); },
      claim(){},
    },
    addEventListener(type,handler) { listeners.set(type,handler); },
    skipWaiting(){}
  };
  const caches = {
    async open() { return {addAll(){},put(){}}; },
    async keys() { return []; },
    async delete(){},
    async match(){ return null; }
  };
  const workerContext = vm.createContext({self,caches,URL,fetch:async()=>({clone(){ return this; }})});
  const workerSource = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
  vm.runInContext(workerSource,workerContext);

  let pushPromise;
  listeners.get("push")({
    data:{json:()=>({title:"Test",body:"Delivered",url:"./index.html#today",tag:"test-tag"})},
    waitUntil(promise) { pushPromise = promise; }
  });
  await pushPromise;
  assert.equal(shown[0].title,"Test");
  assert.equal(shown[0].options.data.url,"https://level90.example/index.html#today");

  let clickPromise;
  listeners.get("notificationclick")({
    notification:{data:shown[0].options.data,close(){}},
    waitUntil(promise) { clickPromise = promise; }
  });
  await clickPromise;
  assert.equal(focused,1);
  assert.equal(JSON.stringify(messages),JSON.stringify([{type:"LEVEL90_OPEN_VIEW",view:"today"}]));
}

run().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
