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

function notificationContext({ios=false,standalone=true}={}) {
  const elements = new Map();
  const writes = [];
  const invocations = [];
  const toasts = [];
  let currentSubscription = null;
  let requestCount = 0;
  let unsubscribeCount = 0;

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
        if (body.action === "config") return {data:{publicKey:"AQIDBA"},error:null};
        if (body.action === "test") return {data:{sent:true},error:null};
        return {data:null,error:new Error("Unexpected action")};
      }
    },
    from(table) {
      return {
        async upsert(record,options) {
          writes.push({kind:"upsert",table,record,options});
          return {error:null};
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
    showToast:message=>toasts.push(message)
  });
  vm.runInContext(`${source}\n;globalThis.notificationApi={
    support:level90NotificationSupport,
    refresh:refreshLevel90NotificationSettings,
    enable:level90EnableNotifications,
    sendTest:level90SendTestNotification,
    disable:level90DisableNotifications
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
