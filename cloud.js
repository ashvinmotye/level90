"use strict";

const LEVEL90_SUPABASE_URL = "https://xacwgipxqujbqvhzogbd.supabase.co";
const LEVEL90_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-_rGsscYv3ipNd7hW23-RQ_bUCB9hTf";
const LEVEL90_AUTH_USER_KEY = "level90.authUser.v1";
const LEVEL90_SYNC_QUEUE_KEY = "level90.syncQueue.v1";
const LEVEL90_LAST_SYNC_PREFIX = "level90.lastSync.v1";
const LEVEL90_MIGRATION_PREFIX = "level90.cloudMigration.v1";
const LEVEL90_RECOVERY_BACKUP_PREFIX = "level90.beforeCloudRestore.v1";
const LEVEL90_AUTOMATIC_SYNC_THROTTLE_MS = 12000;

const level90CloudDom = {
  appShell:document.querySelector("#appShell"),
  authScreen:document.querySelector("#authScreen"),
  authLoading:document.querySelector("#authLoading"),
  authFormContent:document.querySelector("#authFormContent"),
  authForm:document.querySelector("#authForm"),
  authEmail:document.querySelector("#authEmail"),
  authPassword:document.querySelector("#authPassword"),
  authPasswordHelp:document.querySelector("#authPasswordHelp"),
  authSubmitButton:document.querySelector("#authSubmitButton"),
  authMessage:document.querySelector("#authMessage"),
  signInModeButton:document.querySelector("#signInModeButton"),
  signUpModeButton:document.querySelector("#signUpModeButton"),
  accountEmail:document.querySelector("#accountEmail"),
  accountConnectionStatus:document.querySelector("#accountConnectionStatus"),
  accountMessage:document.querySelector("#accountMessage"),
  signOutButton:document.querySelector("#signOutButton"),
  cloudSyncStatus:document.querySelector("#cloudSyncStatus"),
  syncNowButton:document.querySelector("#syncNowButton"),
  cloudMigrationRow:document.querySelector("#cloudMigrationRow"),
  cloudMigrationStatus:document.querySelector("#cloudMigrationStatus"),
  useCloudDataButton:document.querySelector("#useCloudDataButton"),
  uploadExistingDataButton:document.querySelector("#uploadExistingDataButton")
};

let level90AuthMode = "signin";
let level90AuthClient = null;
let level90AuthSession = null;
let level90AuthBusy = false;
let level90AuthResolved = false;
let level90InitialSyncResolved = false;
let level90ActiveUserId = null;
let level90StartingUserId = null;
let level90SyncInProgress = false;
let level90SyncRequested = false;
let level90MigrationInProgress = false;
let level90CloudRestoreInProgress = false;
let level90LastCloudRecordCount = null;
let level90AutomaticSyncTimer = null;
let level90LastAutomaticSyncAt = 0;

function level90SafeJsonParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function level90Clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function level90CachedUser() {
  const cached = level90SafeJsonParse(localStorage.getItem(LEVEL90_AUTH_USER_KEY));
  if (!cached || typeof cached.id !== "string" || typeof cached.email !== "string") return null;
  return cached;
}

function level90CacheUser(user) {
  if (!user?.id || !user?.email) return;
  localStorage.setItem(LEVEL90_AUTH_USER_KEY,JSON.stringify({
    id:user.id,
    email:user.email,
    confirmedAt:user.email_confirmed_at || null,
    cachedAt:Date.now()
  }));
}

function level90ClearCachedUser() {
  localStorage.removeItem(LEVEL90_AUTH_USER_KEY);
}

function level90SyncUserId() {
  return level90AuthSession?.user?.id || level90CachedUser()?.id || null;
}

function level90LastSyncKey(userId=level90SyncUserId()) {
  return userId ? `${LEVEL90_LAST_SYNC_PREFIX}.${userId}` : null;
}

function level90MigrationKey(userId=level90SyncUserId()) {
  return userId ? `${LEVEL90_MIGRATION_PREFIX}.${userId}` : null;
}

function level90RecoveryBackupKey(userId=level90SyncUserId()) {
  return userId ? `${LEVEL90_RECOVERY_BACKUP_PREFIX}.${userId}` : null;
}

function level90MigrationComplete(userId=level90SyncUserId()) {
  const key = level90MigrationKey(userId);
  return Boolean(key && localStorage.getItem(key) === "complete");
}

function level90MarkMigrationComplete(userId=level90SyncUserId()) {
  const key = level90MigrationKey(userId);
  if (key) localStorage.setItem(key,"complete");
}

function canRequestLevel90Name() {
  return level90AuthResolved && level90InitialSyncResolved;
}

function level90SetAuthMessage(message="",type="") {
  if (!level90CloudDom.authMessage) return;
  level90CloudDom.authMessage.textContent = message;
  level90CloudDom.authMessage.classList.toggle("is-error",type === "error");
  level90CloudDom.authMessage.classList.toggle("is-success",type === "success");
}

function level90SetAccountMessage(message="",isError=false) {
  if (!level90CloudDom.accountMessage) return;
  level90CloudDom.accountMessage.textContent = message;
  level90CloudDom.accountMessage.classList.toggle("is-error",isError);
}

function level90SetAuthMode(mode,clearMessage=true) {
  level90AuthMode = mode === "signup" ? "signup" : "signin";
  const signUp = level90AuthMode === "signup";
  level90CloudDom.signInModeButton?.classList.toggle("is-active",!signUp);
  level90CloudDom.signUpModeButton?.classList.toggle("is-active",signUp);
  level90CloudDom.signInModeButton?.setAttribute("aria-pressed",String(!signUp));
  level90CloudDom.signUpModeButton?.setAttribute("aria-pressed",String(signUp));
  if (level90CloudDom.authSubmitButton) level90CloudDom.authSubmitButton.textContent = signUp ? "Create account" : "Sign in";
  if (level90CloudDom.authPassword) level90CloudDom.authPassword.autocomplete = signUp ? "new-password" : "current-password";
  if (level90CloudDom.authPasswordHelp) {
    level90CloudDom.authPasswordHelp.textContent = signUp
      ? "Use at least 6 characters. You may need to confirm your email."
      : "Use the same account as your Workout app.";
  }
  if (clearMessage) level90SetAuthMessage();
}

function level90SetAuthBusy(busy) {
  level90AuthBusy = busy;
  [level90CloudDom.authEmail,level90CloudDom.authPassword,level90CloudDom.signInModeButton,level90CloudDom.signUpModeButton,level90CloudDom.authSubmitButton]
    .filter(Boolean).forEach(element=>{ element.disabled = busy; });
  if (level90CloudDom.authSubmitButton) {
    level90CloudDom.authSubmitButton.textContent = busy
      ? (level90AuthMode === "signup" ? "Creating account…" : "Signing in…")
      : (level90AuthMode === "signup" ? "Create account" : "Sign in");
  }
}

function level90FriendlyAuthError(error) {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();
  if (!navigator.onLine || normalized.includes("failed to fetch") || normalized.includes("network")) return "You appear to be offline. Connect and try again.";
  if (normalized.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (normalized.includes("email not confirmed")) return "Confirm your email, then return to sign in.";
  if (normalized.includes("not authorized") || normalized.includes("email_address_not_authorized")) return "Use the email connected to your Supabase project for this first test.";
  if (normalized.includes("user already registered")) return "An account already exists for this email. Try signing in.";
  if (normalized.includes("rate limit") || normalized.includes("too many")) return "Too many attempts. Wait a little, then try again.";
  return message || "Authentication could not be completed.";
}

function level90FriendlySyncError(error) {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();
  if (!navigator.onLine || normalized.includes("failed to fetch") || normalized.includes("network")) return "Waiting for an internet connection";
  if (normalized.includes("level90_") && (normalized.includes("does not exist") || normalized.includes("not find") || normalized.includes("relation") || normalized.includes("schema cache"))) {
    return "Run the included Level90 Supabase migration";
  }
  if (normalized.includes("row-level security")) return "Sync was blocked by the database security policy";
  return message ? `Sync failed: ${message}` : "Level90 could not be synced";
}

function level90ShowAuthLoading(message="Checking your account…") {
  level90CloudDom.appShell.hidden = true;
  level90CloudDom.authScreen.hidden = false;
  level90CloudDom.authLoading.hidden = false;
  level90CloudDom.authLoading.lastChild.textContent = message;
  level90CloudDom.authFormContent.hidden = true;
}

function level90ShowAuthForm(message="",type="") {
  level90CloudDom.appShell.hidden = true;
  level90CloudDom.authScreen.hidden = false;
  level90CloudDom.authLoading.hidden = true;
  level90CloudDom.authFormContent.hidden = false;
  level90SetAuthMessage(message,type);
}

function level90UpdateAccountPanel(user,offline=false) {
  if (level90CloudDom.accountEmail) level90CloudDom.accountEmail.textContent = user?.email || "—";
  if (level90CloudDom.accountConnectionStatus) {
    const disconnected = offline || !navigator.onLine || !level90AuthSession;
    level90CloudDom.accountConnectionStatus.textContent = disconnected ? "Offline access" : "Connected";
    level90CloudDom.accountConnectionStatus.classList.toggle("is-offline",disconnected);
  }
}

function level90RevealApp(user,offline=false) {
  if (level90ActiveUserId !== user.id) level90LastCloudRecordCount = null;
  level90ActiveUserId = user.id;
  level90AuthResolved = true;
  level90CloudDom.authScreen.hidden = true;
  level90CloudDom.appShell.hidden = false;
  level90UpdateAccountPanel(user,offline);
  level90SetAccountMessage(offline ? "Using local data. Cloud sync will resume when you reconnect." : "");
  renderAll();
  level90UpdateSyncStatus();
  if (typeof initializeLevel90Notifications === "function") initializeLevel90Notifications().catch(()=>{});
}

async function level90ShowAuthenticatedApp(session,options={}) {
  const user = session?.user || options.user;
  if (!user) return;
  level90AuthSession = session?.user ? session : null;
  level90CacheUser(user);

  if (level90ActiveUserId === user.id && level90AuthResolved) {
    level90UpdateAccountPanel(user,Boolean(options.offline));
    if (level90AuthSession && navigator.onLine) level90RequestAutomaticSync({force:true});
    return;
  }
  if (level90StartingUserId === user.id) return;
  level90StartingUserId = user.id;

  level90RevealApp(user,Boolean(options.offline));
  if (options.offline || !level90AuthSession || !navigator.onLine) {
    level90InitialSyncResolved = true;
    level90StartingUserId = null;
    renderAll();
    requestNameIfNeeded();
    return;
  }

  level90InitialSyncResolved = false;
  level90UpdateSyncStatus("Preparing your Level90 cloud data…","waiting");
  try {
    await syncLevel90({initial:true});
  } finally {
    level90InitialSyncResolved = true;
    level90StartingUserId = null;
    renderAll();
    requestNameIfNeeded();
  }
}

function level90AuthRedirectUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function level90SubmitAuth(event) {
  event.preventDefault();
  if (level90AuthBusy || !level90AuthClient) return;
  const email = level90CloudDom.authEmail.value.trim().toLowerCase();
  const password = level90CloudDom.authPassword.value;
  if (!email || !level90CloudDom.authEmail.validity.valid) {
    level90SetAuthMessage("Enter a valid email address.","error");
    level90CloudDom.authEmail.focus();
    return;
  }
  if (password.length < 6) {
    level90SetAuthMessage("Your password must contain at least 6 characters.","error");
    level90CloudDom.authPassword.focus();
    return;
  }
  if (!navigator.onLine) {
    level90SetAuthMessage("Connect to the internet to sign in or create an account.","error");
    return;
  }

  level90SetAuthBusy(true);
  level90SetAuthMessage();
  try {
    if (level90AuthMode === "signup") {
      const {data,error} = await level90AuthClient.auth.signUp({email,password,options:{emailRedirectTo:level90AuthRedirectUrl()}});
      if (error) throw error;
      if (data.session?.user) await level90ShowAuthenticatedApp(data.session);
      else {
        level90CloudDom.authPassword.value = "";
        level90SetAuthMessage("Account created. Confirm your email, then return to sign in.","success");
      }
    } else {
      const {data,error} = await level90AuthClient.auth.signInWithPassword({email,password});
      if (error) throw error;
      if (!data.session?.user) throw new Error("The account session could not be started.");
      await level90ShowAuthenticatedApp(data.session);
    }
  } catch (error) {
    level90SetAuthMessage(level90FriendlyAuthError(error),"error");
  } finally {
    level90SetAuthBusy(false);
  }
}

async function level90SignOut() {
  if (level90AuthBusy) return;
  level90CloudDom.signOutButton.disabled = true;
  level90SetAccountMessage("Signing out…");
  try {
    if (level90AuthClient && level90AuthSession) {
      const {error} = await level90AuthClient.auth.signOut({scope:"local"});
      if (error) throw error;
    }
    level90AuthSession = null;
    level90ActiveUserId = null;
    level90AuthResolved = false;
    level90InitialSyncResolved = false;
    level90LastCloudRecordCount = null;
    level90ClearCachedUser();
    if (typeof resetLevel90NotificationSettings === "function") resetLevel90NotificationSettings();
    level90SetAuthMode("signin",false);
    level90ShowAuthForm("You have been signed out. Your Level90 data remains on this device.","success");
  } catch (error) {
    level90SetAccountMessage(level90FriendlyAuthError(error),true);
  } finally {
    level90CloudDom.signOutButton.disabled = false;
  }
}

function level90OperationId() {
  return `level90-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function level90LoadSyncQueue() {
  const parsed = level90SafeJsonParse(localStorage.getItem(LEVEL90_SYNC_QUEUE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(operation=>operation && typeof operation === "object" && operation.userId && operation.entity && operation.id && operation.record)
    .sort((a,b)=>Number(a.queuedAt)-Number(b.queuedAt));
}

function level90SaveSyncQueue(queue) {
  const sorted = queue.sort((a,b)=>Number(a.queuedAt)-Number(b.queuedAt));
  if (sorted.length) localStorage.setItem(LEVEL90_SYNC_QUEUE_KEY,JSON.stringify(sorted));
  else localStorage.removeItem(LEVEL90_SYNC_QUEUE_KEY);
  level90UpdateSyncStatus();
}

function level90ClearUserSyncQueue(userId=level90SyncUserId()) {
  if (!userId) return;
  level90SaveSyncQueue(level90LoadSyncQueue().filter(operation=>operation.userId !== userId));
}

function level90QueueRecord(entity,id,record,options={}) {
  const userId = level90SyncUserId();
  if (!userId || !id || !record) return;
  const now = new Date().toISOString();
  const queue = level90LoadSyncQueue().filter(operation=>operation.userId !== userId || operation.entity !== entity || operation.id !== id);
  queue.push({
    queueId:level90OperationId(),
    userId,
    entity,
    id,
    record:level90Clone(record),
    sortOrder:Number.isFinite(Number(options.sortOrder)) ? Number(options.sortOrder) : 0,
    deletedAt:options.deleted ? now : null,
    clientUpdatedAt:now,
    queuedAt:Date.now()
  });
  level90SaveSyncQueue(queue);
  level90RequestAutomaticSync();
}

function level90StoicComparable(source) {
  const input=source && typeof source === "object" ? source : {};
  return {
    birthDate:typeof input.birthDate === "string" ? input.birthDate : "",
    horizonYears:Math.max(50,Math.min(120,Math.round(Number(input.horizonYears) || 90))),
    weeks:level90Clone(input.weeks && typeof input.weeks === "object" ? input.weeks : {})
  };
}

function level90ProfileComparable(source) {
  return {
    startedOn:source.startedOn,
    profileName:source.profileName || "",
    theme:source.theme || "dark",
    palette:source.palette || "arctic",
    schemaVersion:Number(source.schemaVersion) || 5,
    stoicCalendar:level90StoicComparable(source.stoicCalendar)
  };
}

function level90CategoryComparable(record,sortOrder) {
  return {id:record.id,name:record.name,icon:record.icon || "✨",description:record.description || "",createdAt:record.createdAt || null,sortOrder};
}

function level90QuestComparable(record,sortOrder) {
  return {
    id:record.id,title:record.title,categoryId:record.categoryId,difficulty:record.difficulty,
    type:record.type,schedule:record.schedule || {mode:"daily"},active:record.active !== false,
    createdOn:record.createdOn || null,createdAt:record.createdAt || null,sortOrder
  };
}

function level90CompletionId(dateKey,questId) {
  return `${dateKey}:${questId}`;
}

function level90FlattenCompletions(source) {
  const flattened = new Map();
  Object.entries(source.completions || {}).forEach(([dateKey,day])=>{
    Object.entries(day || {}).forEach(([questId,value])=>{
      if (!value) return;
      const quest = (source.quests || []).find(item=>item.id===questId) || null;
      const normalized = normalizeCompletionRecord(value,quest,dateKey);
      const id = level90CompletionId(dateKey,questId);
      flattened.set(id,{id,dateKey,questId,completion:normalized});
    });
  });
  return flattened;
}

function level90RecordsEqual(a,b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function queueLevel90StateChanges(previous,next) {
  if (!level90SyncUserId()) return;
  const previousProfile = level90ProfileComparable(previous);
  const nextProfile = level90ProfileComparable(next);
  if (!level90RecordsEqual(previousProfile,nextProfile)) level90QueueRecord("profile","profile",nextProfile);

  const previousCategories = new Map((previous.categories || []).map((record,index)=>[record.id,level90CategoryComparable(record,index)]));
  const nextCategories = new Map((next.categories || []).map((record,index)=>[record.id,level90CategoryComparable(record,index)]));
  nextCategories.forEach((record,id)=>{
    if (!level90RecordsEqual(previousCategories.get(id),record)) level90QueueRecord("category",id,record,{sortOrder:record.sortOrder});
  });
  previousCategories.forEach((record,id)=>{
    if (!nextCategories.has(id)) level90QueueRecord("category",id,record,{sortOrder:record.sortOrder,deleted:true});
  });

  const previousQuests = new Map((previous.quests || []).map((record,index)=>[record.id,level90QuestComparable(record,index)]));
  const nextQuests = new Map((next.quests || []).map((record,index)=>[record.id,level90QuestComparable(record,index)]));
  nextQuests.forEach((record,id)=>{
    if (!level90RecordsEqual(previousQuests.get(id),record)) level90QueueRecord("quest",id,record,{sortOrder:record.sortOrder});
  });
  previousQuests.forEach((record,id)=>{
    if (!nextQuests.has(id)) level90QueueRecord("quest",id,record,{sortOrder:record.sortOrder,deleted:true});
  });

  const previousCompletions = level90FlattenCompletions(previous);
  const nextCompletions = level90FlattenCompletions(next);
  nextCompletions.forEach((record,id)=>{
    if (!level90RecordsEqual(previousCompletions.get(id),record)) level90QueueRecord("completion",id,record);
  });
  previousCompletions.forEach((record,id)=>{
    if (!nextCompletions.has(id)) level90QueueRecord("completion",id,record,{deleted:true});
  });
}

function level90QueueAllLocalData() {
  level90QueueRecord("profile","profile",level90ProfileComparable(state));
  state.categories.forEach((record,index)=>level90QueueRecord("category",record.id,level90CategoryComparable(record,index),{sortOrder:index}));
  state.quests.forEach((record,index)=>level90QueueRecord("quest",record.id,level90QuestComparable(record,index),{sortOrder:index}));
  level90FlattenCompletions(state).forEach((record,id)=>level90QueueRecord("completion",id,record));
}

function level90CompletionCount(source=state) {
  return Object.entries(source.completions || {}).reduce((sum,[dateKey,day])=>{
    return sum+Object.entries(day || {}).reduce((daySum,[questId,value])=>{
      if (!value) return daySum;
      const quest=(source.quests || []).find(item=>item.id===questId) || null;
      return daySum+normalizeCompletionRecord(value,quest,dateKey).count;
    },0);
  },0);
}

function level90HasMeaningfulLocalData() {
  if (level90CompletionCount() > 0 || state.profileName || state.startedOn !== localDateKey() || state.theme !== "dark" || state.palette !== "arctic" || state.stoicCalendar?.birthDate || Object.keys(state.stoicCalendar?.weeks || {}).length) return true;
  const categories = (state.categories || []).map((record,index)=>level90CategoryComparable(record,index));
  const defaultCategories = (CONFIG.categories || []).map((record,index)=>level90CategoryComparable(record,index));
  const quests = (state.quests || []).map((record,index)=>{
    const item = level90QuestComparable(record,index); delete item.createdOn; delete item.createdAt; return item;
  });
  const defaultQuests = (CONFIG.quests || []).map((record,index)=>{
    const item = level90QuestComparable(record,index); delete item.createdOn; delete item.createdAt; return item;
  });
  return !level90RecordsEqual(categories.map(({createdAt,...item})=>item),defaultCategories.map(({createdAt,...item})=>item))
    || !level90RecordsEqual(quests,defaultQuests);
}

function level90NeedsMigrationDecision(userId=level90SyncUserId()) {
  return Boolean(userId && !level90MigrationComplete(userId) && level90HasMeaningfulLocalData());
}

function level90MigrationSummary() {
  const categories = state.categories.length;
  const quests = state.quests.length;
  const completions = level90CompletionCount();
  return `${categories} ${categories === 1 ? "category" : "categories"} · ${quests} ${quests === 1 ? "quest" : "quests"} · ${completions} ${completions === 1 ? "completion" : "completions"}`;
}

function level90CloudRow(operation) {
  const userId = level90AuthSession.user.id;
  const record = operation.record;
  if (operation.entity === "profile") {
    return {
      user_id:userId,
      started_on:record.startedOn,
      profile_name:record.profileName,
      theme:record.theme,
      palette:record.palette,
      schema_version:record.schemaVersion,
      stoic_calendar:record.stoicCalendar,
      client_updated_at:operation.clientUpdatedAt
    };
  }
  if (operation.entity === "category") {
    return {
      user_id:userId,id:operation.id,name:record.name,icon:record.icon,description:record.description,
      sort_order:operation.sortOrder,client_created_at:record.createdAt || operation.clientUpdatedAt,
      client_updated_at:operation.clientUpdatedAt,deleted_at:operation.deletedAt
    };
  }
  if (operation.entity === "quest") {
    return {
      user_id:userId,id:operation.id,title:record.title,category_id:record.categoryId,difficulty:record.difficulty,
      quest_type:record.type,schedule:record.schedule,active:record.active,sort_order:operation.sortOrder,
      created_on:record.createdOn || localDateKey(),client_created_at:record.createdAt || operation.clientUpdatedAt,
      client_updated_at:operation.clientUpdatedAt,deleted_at:operation.deletedAt
    };
  }
  const completion = record.completion;
  return {
    user_id:userId,id:operation.id,quest_id:record.questId,completion_date:record.dateKey,
    completed_at:completion.completedAt,quest_title:completion.questTitle,category_id:completion.categoryId || null,
    difficulty:completion.difficulty,xp_awarded:completion.xpAwarded,completion_count:completion.count,
    client_updated_at:operation.clientUpdatedAt,deleted_at:operation.deletedAt
  };
}

async function level90ProcessSyncQueue() {
  const userId = level90AuthSession.user.id;
  const priority = {profile:0,category:1,quest:2,completion:3};
  const operations = level90LoadSyncQueue().filter(operation=>operation.userId===userId)
    .sort((a,b)=>(priority[a.entity]??9)-(priority[b.entity]??9) || a.queuedAt-b.queuedAt);
  for (const operation of operations) {
    const table = {
      profile:"level90_profiles",
      category:"level90_categories",
      quest:"level90_quests",
      completion:"level90_completions"
    }[operation.entity];
    const onConflict = operation.entity === "profile" ? "user_id" : "user_id,id";
    const response = await level90AuthClient.from(table).upsert(level90CloudRow(operation),{onConflict});
    if (response.error) throw response.error;
    const latest = level90LoadSyncQueue();
    level90SaveSyncQueue(latest.filter(item=>item.queueId!==operation.queueId));
  }
}

function level90CategoryFromCloud(row) {
  return {id:row.id,name:row.name,icon:row.icon || "✨",description:row.description || "",createdAt:row.client_created_at};
}

function level90QuestFromCloud(row) {
  return {
    id:row.id,title:row.title,categoryId:row.category_id,difficulty:row.difficulty,type:row.quest_type,
    schedule:row.schedule || {mode:"daily"},active:row.active !== false,createdOn:row.created_on,createdAt:row.client_created_at
  };
}

function level90MergeCloudList(local,rows,converter,protectLocal,cloudOnly=false) {
  const localMap = new Map(local.map(record=>[record.id,record]));
  if (protectLocal) {
    const merged = [...local];
    rows.filter(row=>!row.deleted_at && !localMap.has(row.id)).sort((a,b)=>a.sort_order-b.sort_order).forEach(row=>merged.push(converter(row)));
    return merged;
  }
  const remoteIds = new Set(rows.map(row=>row.id));
  const remote = rows.filter(row=>!row.deleted_at).sort((a,b)=>a.sort_order-b.sort_order || String(a.id).localeCompare(String(b.id))).map(converter);
  if (cloudOnly) return remote;
  const localOnly = local.filter(record=>!remoteIds.has(record.id));
  return [...remote,...localOnly];
}

function level90ApplyCloudSnapshot(snapshot,options={}) {
  const protectLocal = Boolean(options.protectLocal);
  const cloudOnly = Boolean(options.cloudOnly);
  const profile = snapshot.profile?.[0] || null;
  if (profile && !protectLocal) {
    state.startedOn = profile.started_on || state.startedOn;
    state.profileName = profile.profile_name || "";
    state.theme = profile.theme || "dark";
    state.palette = profile.palette || "arctic";
    state.stoicCalendar = level90StoicComparable(profile.stoic_calendar);
  }
  state.categories = level90MergeCloudList(state.categories,snapshot.categories,level90CategoryFromCloud,protectLocal,cloudOnly);
  state.quests = level90MergeCloudList(state.quests,snapshot.quests,level90QuestFromCloud,protectLocal,cloudOnly);
  if (cloudOnly) state.completions = {};

  snapshot.completions.forEach(row=>{
    const existing = state.completions?.[row.completion_date]?.[row.quest_id];
    if (protectLocal && existing) return;
    if (row.deleted_at) {
      if (!protectLocal && state.completions?.[row.completion_date]) {
        delete state.completions[row.completion_date][row.quest_id];
        if (!Object.keys(state.completions[row.completion_date]).length) delete state.completions[row.completion_date];
      }
      return;
    }
    state.completions[row.completion_date] ||= {};
    state.completions[row.completion_date][row.quest_id] = normalizeCompletionRecord({
      completedAt:row.completed_at,
      questTitle:row.quest_title,
      categoryId:row.category_id || "",
      difficulty:row.difficulty,
      xpAwarded:row.xp_awarded,
      count:row.completion_count
    },state.quests.find(quest=>quest.id===row.quest_id) || null,row.completion_date);
  });

  migrateState();
  save({queue:false});
  renderAll();
}

async function level90FetchCloudSnapshot() {
  const [profile,categories,quests,completions] = await Promise.all([
    level90AuthClient.from("level90_profiles").select("user_id, started_on, profile_name, theme, palette, schema_version, stoic_calendar, client_updated_at, updated_at"),
    level90AuthClient.from("level90_categories").select("id, name, icon, description, sort_order, client_created_at, client_updated_at, deleted_at, updated_at").order("sort_order",{ascending:true}),
    level90AuthClient.from("level90_quests").select("id, title, category_id, difficulty, quest_type, schedule, active, sort_order, created_on, client_created_at, client_updated_at, deleted_at, updated_at").order("sort_order",{ascending:true}),
    level90AuthClient.from("level90_completions").select("id, quest_id, completion_date, completed_at, quest_title, category_id, difficulty, xp_awarded, completion_count, client_updated_at, deleted_at, updated_at").order("completion_date",{ascending:true})
  ]);
  for (const response of [profile,categories,quests,completions]) if (response.error) throw response.error;
  return {profile:profile.data || [],categories:categories.data || [],quests:quests.data || [],completions:completions.data || []};
}

async function level90PullCloudData(options={}) {
  const snapshot = await level90FetchCloudSnapshot();
  level90LastCloudRecordCount = level90CloudRecordCount(snapshot);
  level90ApplyCloudSnapshot(snapshot,options);
  return snapshot;
}

function level90CloudRecordCount(snapshot) {
  return (snapshot.profile?.length || 0)
    + (snapshot.categories || []).filter(row=>!row.deleted_at).length
    + (snapshot.quests || []).filter(row=>!row.deleted_at).length
    + (snapshot.completions || []).filter(row=>!row.deleted_at).reduce((sum,row)=>sum+Math.max(1,Number(row.completion_count) || 1),0);
}

function level90FormatLastSync(timestamp) {
  const elapsedSeconds = Math.max(0,Math.round((Date.now()-Number(timestamp))/1000));
  if (elapsedSeconds < 60) return "Synced just now";
  const minutes = Math.round(elapsedSeconds/60);
  if (minutes < 60) return `Synced ${minutes}m ago`;
  return `Last synced ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(Number(timestamp)))}`;
}

function level90SetSyncStatus(message,stateName="") {
  if (!level90CloudDom.cloudSyncStatus) return;
  level90CloudDom.cloudSyncStatus.textContent = message;
  level90CloudDom.cloudSyncStatus.classList.toggle("is-error",stateName === "error");
  level90CloudDom.cloudSyncStatus.classList.toggle("is-waiting",stateName === "waiting");
  level90CloudDom.cloudSyncStatus.classList.toggle("is-success",stateName === "success");
  level90CloudDom.syncNowButton.disabled = level90SyncInProgress || level90CloudRestoreInProgress || !level90AuthSession || !navigator.onLine;
}

function level90UpdateMigrationUI() {
  if (!level90CloudDom.cloudMigrationRow) return;
  const userId = level90SyncUserId();
  const needed = level90NeedsMigrationDecision(userId);
  level90CloudDom.cloudMigrationRow.hidden = !needed;
  if (!needed) return;
  const cloudStatus = level90LastCloudRecordCount === null
    ? "checking cloud…"
    : level90LastCloudRecordCount > 0 ? "cloud journey found" : "cloud is empty";
  level90CloudDom.cloudMigrationStatus.textContent = `${level90MigrationSummary()} on this device · ${cloudStatus}`;
  level90CloudDom.uploadExistingDataButton.textContent = level90MigrationInProgress ? "Uploading…" : "Upload this device";
  level90CloudDom.useCloudDataButton.textContent = level90CloudRestoreInProgress ? "Loading cloud…" : "Use cloud data";
  const busy = level90MigrationInProgress || level90CloudRestoreInProgress || level90SyncInProgress;
  level90CloudDom.uploadExistingDataButton.disabled = busy || !level90AuthSession || !navigator.onLine;
  level90CloudDom.useCloudDataButton.disabled = busy || !level90AuthSession || !navigator.onLine || !(level90LastCloudRecordCount > 0);
}

function level90UpdateSyncStatus(message=null,stateName="") {
  level90UpdateMigrationUI();
  if (message !== null) {
    level90SetSyncStatus(message,stateName);
    return;
  }
  const userId = level90SyncUserId();
  const pending = level90LoadSyncQueue().filter(operation=>operation.userId===userId).length;
  if (!navigator.onLine || !level90AuthSession) {
    level90SetSyncStatus(pending ? `${pending} ${pending===1?"change":"changes"} waiting for connection` : "Offline — local Level90 data is available","waiting");
    return;
  }
  if (level90SyncInProgress) {
    level90SetSyncStatus("Syncing Level90…","waiting");
    return;
  }
  if (level90CloudRestoreInProgress) {
    level90SetSyncStatus("Loading the cloud journey…","waiting");
    return;
  }
  if (level90NeedsMigrationDecision(userId)) {
    level90SetSyncStatus("Choose which existing journey to keep","waiting");
    return;
  }
  if (pending) {
    level90SetSyncStatus(`${pending} ${pending===1?"change":"changes"} waiting to sync`,"waiting");
    return;
  }
  const key = level90LastSyncKey(userId);
  const lastSync = key ? Number(localStorage.getItem(key)) : 0;
  level90SetSyncStatus(lastSync ? level90FormatLastSync(lastSync) : "Ready to sync",lastSync ? "success" : "");
}

async function syncLevel90(options={}) {
  if (level90SyncInProgress) {
    level90SyncRequested = true;
    return false;
  }
  if (level90CloudRestoreInProgress || !level90AuthClient || !level90AuthSession || !navigator.onLine) {
    level90UpdateSyncStatus();
    if (options.manual) showToast("Level90 will sync when you are online and signed in.");
    return false;
  }

  level90SyncInProgress = true;
  level90SyncRequested = false;
  level90UpdateSyncStatus();
  try {
    const userId = level90AuthSession.user.id;
    const protectLocal = !options.migration && level90NeedsMigrationDecision(userId);
    if (!protectLocal) await level90ProcessSyncQueue();
    let snapshot = await level90PullCloudData({protectLocal});

    if (options.migration) {
      level90MarkMigrationComplete(userId);
      snapshot = await level90PullCloudData({protectLocal:false});
    } else if (!level90MigrationComplete(userId) && !protectLocal) {
      if (!level90CloudRecordCount(snapshot)) {
        level90QueueAllLocalData();
        await level90ProcessSyncQueue();
        snapshot = await level90PullCloudData({protectLocal:false});
      }
      level90MarkMigrationComplete(userId);
    }

    const syncedAt = Date.now();
    localStorage.setItem(level90LastSyncKey(userId),String(syncedAt));
    level90SetSyncStatus(protectLocal ? "Choose which existing journey to keep" : level90FormatLastSync(syncedAt),protectLocal ? "waiting" : "success");
    level90UpdateMigrationUI();
    if (options.manual) showToast(protectLocal ? "Cloud checked. Choose which journey to keep." : "Level90 synced.");
    return true;
  } catch (error) {
    level90SetSyncStatus(level90FriendlySyncError(error),"error");
    if (options.manual) showToast("Level90 sync failed.");
    return false;
  } finally {
    level90SyncInProgress = false;
    level90CloudDom.syncNowButton.disabled = level90CloudRestoreInProgress || !level90AuthSession || !navigator.onLine;
    level90UpdateMigrationUI();
    if (level90SyncRequested && level90AuthSession && navigator.onLine) window.setTimeout(()=>syncLevel90(),0);
  }
}

async function level90UploadExistingData() {
  if (level90MigrationInProgress || level90CloudRestoreInProgress || level90SyncInProgress || !level90AuthSession || !navigator.onLine) return;
  const summary = level90MigrationSummary();
  if (!window.confirm(`Upload this device's existing Level90 data?\n\n${summary}\n\nUse this only on your main device. Matching cloud records will be updated from this device; cloud-only records will be kept.`)) return;
  level90MigrationInProgress = true;
  level90UpdateMigrationUI();
  try {
    level90QueueAllLocalData();
    const success = await syncLevel90({migration:true});
    if (success) showToast("Existing Level90 data uploaded.");
  } finally {
    level90MigrationInProgress = false;
    level90UpdateMigrationUI();
  }
}

function level90SaveRecoveryBackup(userId) {
  const key = level90RecoveryBackupKey(userId);
  if (key) localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),state:level90Clone(state)}));
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `level90-before-cloud-${localDateKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

async function level90UseCloudData() {
  if (level90MigrationInProgress || level90CloudRestoreInProgress || level90SyncInProgress || !level90AuthSession || !navigator.onLine || !(level90LastCloudRecordCount > 0)) return;
  if (!window.confirm("Replace this device's Level90 journey with the cloud journey?\n\nUse this on your laptop after uploading your main phone. This device's current data and pending changes will be replaced. A JSON backup will be downloaded first.")) return;
  const userId = level90AuthSession.user.id;
  level90CloudRestoreInProgress = true;
  level90UpdateMigrationUI();
  level90UpdateSyncStatus("Loading the cloud journey…","waiting");
  let completed = false;
  try {
    level90SaveRecoveryBackup(userId);
    const snapshot = await level90FetchCloudSnapshot();
    const cloudCount = level90CloudRecordCount(snapshot);
    level90LastCloudRecordCount = cloudCount;
    if (!cloudCount) throw new Error("No Level90 cloud journey was found. Upload the main device first.");
    level90ClearUserSyncQueue(userId);
    level90ApplyCloudSnapshot(snapshot,{protectLocal:false,cloudOnly:true});
    level90MarkMigrationComplete(userId);
    const syncedAt = Date.now();
    localStorage.setItem(level90LastSyncKey(userId),String(syncedAt));
    level90SetSyncStatus(level90FormatLastSync(syncedAt),"success");
    completed = true;
    showToast("This device now matches the cloud journey.");
  } catch (error) {
    level90SetSyncStatus(level90FriendlySyncError(error),"error");
    showToast("Cloud journey could not be loaded.");
  } finally {
    level90CloudRestoreInProgress = false;
    level90UpdateMigrationUI();
    if (completed) level90UpdateSyncStatus();
    else level90CloudDom.syncNowButton.disabled = !level90AuthSession || !navigator.onLine;
  }
}

function level90CanAutomaticallySync() {
  return Boolean(level90AuthClient && level90AuthSession && navigator.onLine && !level90CloudRestoreInProgress && document.visibilityState !== "hidden");
}

function level90RequestAutomaticSync(options={}) {
  if (!level90CanAutomaticallySync()) return;
  const now = Date.now();
  const delay = options.force ? 0 : Math.max(250,LEVEL90_AUTOMATIC_SYNC_THROTTLE_MS-(now-level90LastAutomaticSyncAt));
  if (level90AutomaticSyncTimer !== null) {
    if (!options.force) return;
    window.clearTimeout(level90AutomaticSyncTimer);
  }
  level90AutomaticSyncTimer = window.setTimeout(async()=>{
    level90AutomaticSyncTimer = null;
    if (!level90CanAutomaticallySync()) return;
    level90LastAutomaticSyncAt = Date.now();
    await syncLevel90();
  },delay);
}

async function level90RefreshAuthentication() {
  if (!level90AuthClient) return;
  if (level90AuthSession) {
    level90UpdateAccountPanel(level90AuthSession.user);
    level90RequestAutomaticSync({force:true});
    return;
  }
  try {
    const {data,error} = await level90AuthClient.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await level90ShowAuthenticatedApp(data.session);
  } catch {
    level90UpdateSyncStatus();
  }
}

function level90HandleAuthStateChange(event,session) {
  if (session?.user) {
    level90ShowAuthenticatedApp(session).catch(()=>{});
    return;
  }
  if (event === "SIGNED_OUT" || event === "USER_DELETED") {
    level90AuthSession = null;
    level90ActiveUserId = null;
    level90AuthResolved = false;
    level90InitialSyncResolved = false;
    level90LastCloudRecordCount = null;
    level90ClearCachedUser();
    if (typeof resetLevel90NotificationSettings === "function") resetLevel90NotificationSettings();
    level90SetAuthMode("signin",false);
    level90ShowAuthForm("You have been signed out.","success");
  }
}

function level90BindCloudEvents() {
  level90CloudDom.signInModeButton.addEventListener("click",()=>level90SetAuthMode("signin"));
  level90CloudDom.signUpModeButton.addEventListener("click",()=>level90SetAuthMode("signup"));
  level90CloudDom.authForm.addEventListener("submit",level90SubmitAuth);
  level90CloudDom.signOutButton.addEventListener("click",level90SignOut);
  level90CloudDom.syncNowButton.addEventListener("click",()=>syncLevel90({manual:true}));
  level90CloudDom.useCloudDataButton.addEventListener("click",level90UseCloudData);
  level90CloudDom.uploadExistingDataButton.addEventListener("click",level90UploadExistingData);
  window.addEventListener("focus",()=>level90RequestAutomaticSync());
  document.addEventListener("visibilitychange",()=>{ if (document.visibilityState === "visible") level90RequestAutomaticSync(); });
  window.addEventListener("online",level90RefreshAuthentication);
  window.addEventListener("offline",()=>{
    const user = level90AuthSession?.user || level90CachedUser();
    if (user) level90UpdateAccountPanel(user,true);
    level90UpdateSyncStatus();
  });
}

async function initializeLevel90Cloud() {
  level90BindCloudEvents();
  level90SetAuthMode("signin");
  level90ShowAuthLoading();

  if (!window.supabase?.createClient) {
    const cachedUser = level90CachedUser();
    if (!navigator.onLine && cachedUser) {
      await level90ShowAuthenticatedApp(null,{user:cachedUser,offline:true});
      return;
    }
    level90ShowAuthForm("The account service could not be loaded. Check your connection and reload.","error");
    return;
  }

  level90AuthClient = window.supabase.createClient(LEVEL90_SUPABASE_URL,LEVEL90_SUPABASE_PUBLISHABLE_KEY,{
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
  });
  level90AuthClient.auth.onAuthStateChange((event,session)=>window.setTimeout(()=>level90HandleAuthStateChange(event,session),0));

  try {
    const {data,error} = await level90AuthClient.auth.getSession();
    if (error) throw error;
    if (data.session?.user) {
      await level90ShowAuthenticatedApp(data.session);
      return;
    }
    const cachedUser = level90CachedUser();
    if (!navigator.onLine && cachedUser) {
      await level90ShowAuthenticatedApp(null,{user:cachedUser,offline:true});
      return;
    }
    level90ShowAuthForm();
  } catch (error) {
    const cachedUser = level90CachedUser();
    if (!navigator.onLine && cachedUser) await level90ShowAuthenticatedApp(null,{user:cachedUser,offline:true});
    else level90ShowAuthForm(level90FriendlyAuthError(error),"error");
  }
}
