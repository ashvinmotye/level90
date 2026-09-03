
const STORAGE_KEY = "level90-state-v1";
let CONFIG = null;
let state = null;
let questFilter = "all";
let reorderMode = false;
let questDragState = null;
let selectedHistoryDate = null;
let historyMonth = null;
let levelGlowAnimation = null;
let lastSavedStateJson = "";
let activeView = "today";
let settingsReturnView = "today";
let notificationsReturnView = "today";
let selectedStoicYear = null;
let selectedStoicWeek = null;
const PALETTES = ["arctic","jade","aurora","rose"];
const APP_VIEWS = ["today","quests","journey","character","notifications","settings"];
const STOIC_DEFAULT_HORIZON = 90;
const STOIC_MIN_HORIZON = 50;
const STOIC_MAX_HORIZON = 120;
const STOIC_TEXT_LIMITS = {intention:220,control:360,reaction:360,correction:360};
const ICON_LIBRARY = [
  ["✨","sparkle magic default"],["⚡","energy discipline focus"],["✅","check done complete"],
  ["💪","strength body workout"],["🏋️‍♀️","weights gym strength workout"],["🏃","run cardio fitness"],
  ["🚶","walk steps movement"],["🚴","bike cycle cardio"],["🤸","mobility stretch flexibility"],
  ["🧘","yoga meditate calm"],["🧠","mind thinking focus"],["📚","read books study"],
  ["🎓","learn school education"],["✍️","write journal notes"],["💻","code computer career"],
  ["☁️","cloud salesforce work"],["💼","career business work"],["🚀","project ship launch"],
  ["🛠️","build craft project"],["💰","money finance income"],["🪙","save coin budget"],
  ["🥗","food health nutrition"],["💧","water hydrate health"],["🌙","sleep bedtime recovery"],
  ["☀️","morning sun routine"],["❤️","heart relationships health"],["🏠","home family house"],
  ["🧹","clean chores home"],["🎨","creative art design"],["🎵","music practice"],
  ["📞","call connect social"],["🧗","climb hang challenge"],["🌱","growth nature habit"],
  ["🎯","goal target focus"],["🔥","streak fire motivation"],["🛡️","protect resilience defense"]
].map(([icon,keywords])=>({icon,keywords}));

const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];

function auraIcon(name,extraClass="") {
  const className = extraClass ? `aura-icon ${extraClass}` : "aura-icon";
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
}

function difficultyDot(id) {
  const key = Object.prototype.hasOwnProperty.call(CONFIG?.difficulty || {},id) ? id : "easy";
  return `<i class="difficulty-dot difficulty-dot-${key}" aria-hidden="true"></i>`;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function parseLocalDate(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d);
}
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate()+n); return d;
}
function previousCalendarDateKey(asOf=new Date()) {
  const previous = new Date(asOf.getFullYear(),asOf.getMonth(),asOf.getDate());
  previous.setDate(previous.getDate()-1);
  return localDateKey(previous);
}
function isEditableHistoryDate(dateKey,asOf=new Date()) {
  return dateKey === previousCalendarDateKey(asOf);
}
function daysBetween(a,b) {
  const x = new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const y = new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.floor((x-y)/86400000);
}
function isValidLocalDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return false;
  const parsed = parseLocalDate(key);
  return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === key;
}
function calendarDaysBetween(a,b) {
  const utcA = Date.UTC(a.getFullYear(),a.getMonth(),a.getDate());
  const utcB = Date.UTC(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round((utcA-utcB)/86400000);
}
function addCalendarYearsClamped(date,years) {
  const targetYear = date.getFullYear()+years;
  const targetMonth = date.getMonth();
  const lastDay = new Date(targetYear,targetMonth+1,0).getDate();
  return new Date(targetYear,targetMonth,Math.min(date.getDate(),lastDay));
}
function freshStoicCalendar() {
  return {birthDate:"",horizonYears:STOIC_DEFAULT_HORIZON,weeks:{}};
}
function normalizeStoicText(value,limit) {
  return typeof value === "string" ? value.slice(0,limit) : "";
}
function normalizeStoicCalendar(source) {
  const input = source && typeof source === "object" ? source : {};
  const birthDate = isValidLocalDateKey(input.birthDate) && input.birthDate <= localDateKey() ? input.birthDate : "";
  let horizonYears = Math.round(Number(input.horizonYears) || STOIC_DEFAULT_HORIZON);
  horizonYears = Math.max(STOIC_MIN_HORIZON,Math.min(STOIC_MAX_HORIZON,horizonYears));
  const weeks = {};
  Object.entries(input.weeks && typeof input.weeks === "object" ? input.weeks : {}).forEach(([key,value])=>{
    const match = /^(\d{1,3}):(\d{2})$/.exec(key);
    if (!match || Number(match[1]) >= STOIC_MAX_HORIZON || Number(match[2]) > 51 || !value || typeof value !== "object") return;
    const record = {
      intention:normalizeStoicText(value.intention,STOIC_TEXT_LIMITS.intention),
      control:normalizeStoicText(value.control,STOIC_TEXT_LIMITS.control),
      reaction:normalizeStoicText(value.reaction,STOIC_TEXT_LIMITS.reaction),
      correction:normalizeStoicText(value.correction,STOIC_TEXT_LIMITS.correction),
      updatedAt:Number.isNaN(Date.parse(value.updatedAt)) ? null : new Date(value.updatedAt).toISOString()
    };
    if (record.intention || record.control || record.reaction || record.correction) weeks[key]=record;
  });
  return {birthDate,horizonYears,weeks};
}
function uid() { return "q_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function categoryUid() { return "cat_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

async function bootstrap() {
  CONFIG = await fetch("./data/initial-data.json").then(r => r.json());
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { state = JSON.parse(saved); } catch {}
  }
  if (!state) state = freshState();
  migrateState();
  save({queue:false});
  bindEvents();
  showView(viewFromLocation(),{remember:false,updateHash:false,scroll:false});
  renderAll();
  startLevelNumberGlow();
  registerSW();
  if (typeof initializeLevel90Cloud === "function") await initializeLevel90Cloud();
}

function startLevelNumberGlow() {
  const number = $("#levelNumber");
  if (!number) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (typeof number.animate !== "function") {
    if (!motion.matches) number.classList.add("css-glow-drift");
    return;
  }

  let current = [-24,28,116,76];
  const position = ([x1,y1,x2,y2]) => `${x1}% ${y1}%,${x2}% ${y2}%,center`;
  const random = (min,max) => Math.round(min + Math.random() * (max-min));

  const stop = () => {
    levelGlowAnimation?.cancel();
    levelGlowAnimation = null;
  };
  const drift = () => {
    if (motion.matches || levelGlowAnimation) return;
    const next = [random(-28,118),random(-22,118),random(-24,120),random(-20,116)];
    levelGlowAnimation = number.animate(
      [{backgroundPosition:position(current)},{backgroundPosition:position(next)}],
      {duration:random(2800,5600),easing:"cubic-bezier(.42,0,.24,1)",fill:"forwards"}
    );
    levelGlowAnimation.onfinish = () => {
      number.style.backgroundPosition = position(next);
      current = next;
      levelGlowAnimation.cancel();
      levelGlowAnimation = null;
      drift();
    };
  };
  const syncMotion = () => {
    if (motion.matches) stop();
    else drift();
  };
  if (motion.addEventListener) motion.addEventListener("change",syncMotion);
  else motion.addListener(syncMotion);
  syncMotion();
}
function freshState() {
  return {
    schemaVersion: 5,
    startedOn: localDateKey(),
    quests: structuredClone(CONFIG.quests),
    categories: structuredClone(CONFIG.categories),
    completions: {},
    theme: "dark",
    palette: "arctic",
    profileName: "",
    stoicCalendar:freshStoicCalendar()
  };
}
function migrateState() {
  state.quests ||= structuredClone(CONFIG.quests);
  state.categories ||= structuredClone(CONFIG.categories);
  state.completions ||= {};
  state.startedOn ||= localDateKey();
  state.schemaVersion = 5;
  state.theme ||= "dark";
  if (!PALETTES.includes(state.palette)) state.palette = "arctic";
  state.profileName = typeof state.profileName === "string" ? state.profileName.trim() : "";
  state.stoicCalendar = normalizeStoicCalendar(state.stoicCalendar);
  const migrationTimestamp = new Date().toISOString();
  state.categories.forEach(c=>{
    c.id ||= categoryUid();
    c.icon ||= "✨";
    c.createdAt ||= migrationTimestamp;
  });
  state.quests.forEach(q=>{
    q.id ||= uid();
    q.createdOn ||= earliestCompletionKey(q.id) || state.startedOn;
    q.createdAt ||= migrationTimestamp;
    delete q.icon;
  });
  Object.entries(state.completions).forEach(([dateKey,day])=>{
    if (!day || typeof day !== "object") {
      delete state.completions[dateKey];
      return;
    }
    Object.entries(day).forEach(([questId,value])=>{
      if (!value) {
        delete day[questId];
        return;
      }
      const quest = state.quests.find(q=>q.id===questId) || null;
      day[questId] = normalizeCompletionRecord(value,quest,dateKey);
    });
    if (!Object.keys(day).length) delete state.completions[dateKey];
  });
  selectedHistoryDate ||= localDateKey();
  historyMonth ||= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  applyTheme();
}
function save(options={}) {
  const previous = lastSavedStateJson ? JSON.parse(lastSavedStateJson) : null;
  const nextJson = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY,nextJson);
  lastSavedStateJson = nextJson;
  if (options.queue !== false && previous && typeof queueLevel90StateChanges === "function") {
    queueLevel90StateChanges(previous,JSON.parse(nextJson));
  }
}

function requestNameIfNeeded() {
  const dialog=$("#nameDialog");
  if (typeof canRequestLevel90Name === "function" && !canRequestLevel90Name()) return;
  if(state.profileName || !dialog || dialog.open || activeView === "settings") return;
  $("#nameInput").value="";
  dialog.showModal();
  setTimeout(()=>$("#nameInput").focus(),0);
}

function viewFromLocation() {
  const requested = String(window.location.hash || "").replace(/^#/,"");
  return APP_VIEWS.includes(requested) ? requested : "today";
}

function showView(view,options={}) {
  const nextView = APP_VIEWS.includes(view) ? view : "today";
  if (nextView === "settings" && activeView !== "settings" && options.remember !== false) settingsReturnView = activeView;
  if (nextView === "notifications" && activeView !== "notifications" && options.remember !== false) notificationsReturnView = activeView;
  activeView = nextView;
  $$(".view").forEach(item=>item.classList.toggle("active",item.id === `view-${nextView}`));
  $$(".nav-btn").forEach(button=>button.classList.toggle("active",button.dataset.view === nextView));
  if (options.updateHash !== false && window.location.hash !== `#${nextView}`) {
    window.history.replaceState(null,"",`#${nextView}`);
  }
  if (nextView === "character" && state && CONFIG) renderCharacter();
  if (options.scroll !== false) window.scrollTo({top:0,behavior:"smooth"});
  if (nextView === "settings" && typeof refreshLevel90NotificationSettings === "function") {
    refreshLevel90NotificationSettings().catch(()=>{});
  }
  if (nextView === "notifications" && typeof refreshLevel90NotificationInbox === "function") {
    refreshLevel90NotificationInbox().catch(()=>{});
  }
}

function openSettingsPage() {
  showView("settings");
}

function closeSettingsPage() {
  showView(settingsReturnView === "settings" ? "today" : settingsReturnView);
  requestNameIfNeeded();
}

function closeNotificationsPage() {
  showView(notificationsReturnView === "notifications" ? "today" : notificationsReturnView);
  requestNameIfNeeded();
}

function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  document.body.dataset.palette = state.palette || "arctic";
  const quickToggle = $("#themeBtn");
  if (quickToggle) {
    const label = state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    quickToggle.setAttribute("aria-label",label);
    quickToggle.title = label;
  }
  $$("[data-theme-mode]").forEach(button=>button.classList.toggle("selected",button.dataset.themeMode===state.theme));
  $$("[data-palette]").forEach(button=>button.classList.toggle("selected",button.dataset.palette===state.palette));
  const browserColor=getComputedStyle(document.body).getPropertyValue("--bg").trim();
  const themeMeta=$("meta[name='theme-color']");
  if(themeMeta && browserColor) themeMeta.setAttribute("content",browserColor);
}

function difficulty(id) { return CONFIG.difficulty[id] || CONFIG.difficulty.easy; }
function category(id) { return state.categories.find(c => c.id === id) || {name:"Other",icon:"✨"}; }

function xpForQuest(q) { return difficulty(q.difficulty).xp; }

function completionFallbackTimestamp(dateKey) {
  const parsed = parseLocalDate(dateKey);
  parsed.setHours(12,0,0,0);
  return parsed.toISOString();
}

function normalizeCompletionRecord(value,quest,dateKey) {
  const source = value && typeof value === "object" ? value : {};
  const rawCompletedAt = typeof value === "string" ? value : source.completedAt;
  const completedAt = Number.isNaN(Date.parse(rawCompletedAt)) ? completionFallbackTimestamp(dateKey) : new Date(rawCompletedAt).toISOString();
  const requestedDifficulty = typeof source.difficulty === "string" ? source.difficulty : (quest?.difficulty || "easy");
  const difficultyId = Object.hasOwn(CONFIG.difficulty,requestedDifficulty) ? requestedDifficulty : "easy";
  const awarded = Number(source.xpAwarded);
  const requestedCount = Number(source.count ?? source.completionCount ?? 1);
  return {
    completedAt,
    questTitle: typeof source.questTitle === "string" ? source.questTitle : (quest?.title || "Deleted quest"),
    categoryId: typeof source.categoryId === "string" ? source.categoryId : (quest?.categoryId || ""),
    difficulty: difficultyId,
    xpAwarded: Number.isFinite(awarded) && awarded >= 0 ? Math.round(awarded) : difficulty(difficultyId).xp,
    count:Number.isFinite(requestedCount) ? Math.max(1,Math.min(999,Math.round(requestedCount))) : 1
  };
}

function completionRecord(id,dateKey=localDateKey()) {
  const value = state.completions?.[dateKey]?.[id];
  if (!value) return null;
  const quest = state.quests.find(q=>q.id===id) || null;
  return normalizeCompletionRecord(value,quest,dateKey);
}

function completionXp(id,dateKey=localDateKey()) {
  const record = completionRecord(id,dateKey);
  return record ? record.xpAwarded*record.count : 0;
}

function completionCount(id,dateKey=localDateKey()) {
  return completionRecord(id,dateKey)?.count || 0;
}

function isScheduledOn(q, date) {
  if (!q.active) return false;
  if (q.createdOn && localDateKey(date) < q.createdOn) return false;
  if (q.type === "oneoff") {
    return !isQuestEverCompleted(q.id) || isCompleted(q.id, localDateKey(date));
  }
  const mode = q.schedule?.mode || "daily";
  if (mode === "daily") return true;
  if (mode === "weekdays") return (q.schedule.days || []).includes(date.getDay());
  return false;
}

function isCompleted(id, dateKey=localDateKey()) {
  return !!state.completions?.[dateKey]?.[id];
}
function completionValue(id, dateKey=localDateKey()) {
  return state.completions?.[dateKey]?.[id];
}
function completionTimeLabel(id, dateKey) {
  const value = completionRecord(id,dateKey);
  if (!value?.completedAt) return "Completed";
  const completedAt = new Date(value.completedAt);
  if (Number.isNaN(completedAt.getTime())) return "Completed";
  return `Completed at ${new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(completedAt)}`;
}
function isQuestEverCompleted(id) {
  return Object.values(state.completions || {}).some(day => !!day[id]);
}

function earliestCompletionKey(id) {
  return Object.keys(state.completions || {})
    .filter(dateKey => !!state.completions?.[dateKey]?.[id])
    .sort()[0] || null;
}

function isRecurringScheduledOn(q, date) {
  if (q.type !== "recurring") return false;
  const mode = q.schedule?.mode || "daily";
  if (mode === "daily") return true;
  if (mode === "weekdays") return (q.schedule.days || []).includes(date.getDay());
  return false;
}

function questStreak(q, asOf=new Date()) {
  if (q.type !== "recurring") return null;

  const todayKey = localDateKey(asOf);
  const today = parseLocalDate(todayKey);
  const firstCompletion = earliestCompletionKey(q.id);
  const startKey = q.createdOn || firstCompletion || state.startedOn || todayKey;
  const start = parseLocalDate(startKey);
  let current = 0;
  let best = 0;

  for (let date = start; date <= today; date = addDays(date,1)) {
    if (!isRecurringScheduledOn(q,date)) continue;
    const dateKey = localDateKey(date);
    const completed = isCompleted(q.id,dateKey);

    if (completed) {
      current += 1;
      best = Math.max(best,current);
    } else if (dateKey !== todayKey) {
      current = 0;
    }
  }

  return {current,best};
}

function questConsistency(q, asOf=new Date()) {
  if (q.type !== "recurring") return null;

  const asOfKey = localDateKey(asOf);
  const firstCompletion = earliestCompletionKey(q.id);
  const startKey = q.createdOn || firstCompletion || state.startedOn || asOfKey;
  const start = parseLocalDate(startKey);
  const end = parseLocalDate(asOfKey);
  let scheduled = 0;
  let completed = 0;

  for (let date = start; date <= end; date = addDays(date,1)) {
    if (!isRecurringScheduledOn(q,date)) continue;
    scheduled += 1;
    if (isCompleted(q.id,localDateKey(date))) completed += 1;
  }

  return {
    completed,
    scheduled,
    percentage:scheduled ? Math.round((completed/scheduled)*100) : 0
  };
}

function plannedQuestsFor(date) {
  return state.quests.filter(q => isScheduledOn(q,date));
}
function scoreQuestsFor(date) {
  return plannedQuestsFor(date).filter(q => q.type === "recurring");
}
function completedXpForDate(date) {
  const key = localDateKey(date);
  return Object.entries(state.completions?.[key] || {}).reduce((sum,[id,value]) => sum + (value ? completionXp(id,key) : 0), 0);
}
function completedScoreXpForDate(date) {
  const key = localDateKey(date);
  const eligibleIds = new Set(scoreQuestsFor(date).map(quest=>quest.id));
  return Object.entries(state.completions?.[key] || {}).reduce((sum,[id,value]) => {
    const record = value && eligibleIds.has(id) ? completionRecord(id,key) : null;
    return sum + (record?.xpAwarded || 0);
  },0);
}
function plannedXpForDate(date) {
  return scoreQuestsFor(date).reduce((sum,q) => sum + xpForQuest(q), 0);
}
function dailyScoreFor(date) {
  const planned = plannedXpForDate(date);
  if (!planned) return 0;
  return Math.min(100,Math.round((completedScoreXpForDate(date) / planned) * 100));
}
function strongDayCount(asOf=new Date()) {
  const asOfKey = localDateKey(asOf);
  return Object.keys(state.completions || {}).filter(dateKey => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey > asOfKey) return false;
    const date = parseLocalDate(dateKey);
    return localDateKey(date) === dateKey && dailyScoreFor(date) >= 80;
  }).length;
}
function totalXp() {
  let total = 0;
  Object.entries(state.completions).forEach(([dateKey, completions]) => {
    Object.keys(completions).forEach(id => {
      if (completions[id]) total += completionXp(id,dateKey);
    });
  });
  return total;
}

function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  // smooth curve: levels become gradually harder
  return Math.round(80 * Math.pow(level - 1, 1.55));
}
function maxLevel() { return CONFIG.app.maxLevel || 90; }
function levelFromXp(xp) {
  let lvl = 1;
  while (xpRequiredForLevel(lvl + 1) <= xp && lvl < maxLevel()) lvl++;
  return lvl;
}
function levelProgress(xp) {
  const lvl = levelFromXp(xp);
  const start = xpRequiredForLevel(lvl);
  if (lvl >= maxLevel()) return {lvl,start,end:start,pct:100,maxed:true};
  const end = xpRequiredForLevel(lvl+1);
  return {
    lvl, start, end, maxed:false,
    pct: Math.max(0, Math.min(100, ((xp-start)/(end-start))*100))
  };
}
function categoryXp(catId) {
  let total = 0;
  Object.entries(state.completions).forEach(([dateKey,day]) => {
    Object.entries(day).forEach(([id,done]) => {
      const record = done ? completionRecord(id,dateKey) : null;
      if (record?.categoryId === catId) total += completionXp(id,dateKey);
    });
  });
  return total;
}

function journeyDay(date=new Date()) {
  return Math.max(1, daysBetween(date, parseLocalDate(state.startedOn)) + 1);
}
function momentum() {
  let sum = 0, count = 0;
  for (let i=0;i<7;i++) {
    const d = addDays(new Date(), -i);
    if (d < parseLocalDate(state.startedOn)) continue;
    sum += dailyScoreFor(d); count++;
  }
  return count ? Math.round(sum/count) : 0;
}

function renderAll() {
  renderHeader();
  renderToday();
  renderQuestLibrary();
  renderHistory();
  renderCharacter();
  renderDifficulty();
  requestNameIfNeeded();
}
function renderHeader() {
  const xp = totalXp();
  const p = levelProgress(xp);
  const today = new Date();
  const day = journeyDay(today);
  const nextQuest = plannedQuestsFor(today).find(q => !isCompleted(q.id));
  const currentRank = rankForLevel(p.lvl);
  document.body.dataset.rankTier = String(currentRank.level);
  $("#levelNumber").textContent = p.lvl;
  $("#greetingName").textContent = state.profileName || "Player";
  $("#profileNameInput").value = state.profileName;
  $("#characterLevelTitle").textContent = `Level ${p.lvl}`;
  $("#xpText").textContent = p.maxed ? `${xp} TOTAL XP` : `${xp - p.start} / ${p.end - p.start} XP`;
  $("#nextLevelText").textContent = p.maxed ? "LEVEL 90 · ASCENDED" : `NEXT · LEVEL ${p.lvl + 1}`;
  $("#levelProgressFill").style.width=`${p.pct}%`;
  $("#levelProgressTrack").setAttribute("aria-valuenow",String(Math.round(p.pct)));
  $("#journeyDayLabel").textContent = `JOURNEY DAY ${day}`;
  $("#levelPrompt").textContent = p.maxed ? "LEVEL 90 REACHED · KEEP BUILDING YOUR CHARACTER" : nextQuest
    ? `NEXT MOVE · ${nextQuest.title.toUpperCase()} · +${xpForQuest(nextQuest)} XP`
    : "TODAY'S QUESTS CLEARED · PROTECT THE MOMENTUM";
  $("#dateLabel").textContent = new Intl.DateTimeFormat(undefined,{weekday:"long",month:"short",day:"numeric"}).format(new Date());
  applyTheme();
  renderLevelRoad(p.lvl);
}

const LEVEL_RANKS = [
  {level:1,title:"The Ascent Begins"},
  {level:5,title:"Momentum Builder"},
  {level:10,title:"Quest Runner"},
  {level:20,title:"Rising Force"},
  {level:30,title:"Disciplined"},
  {level:50,title:"Relentless"},
  {level:75,title:"Elite"},
  {level:90,title:"Ascended"}
];
function rankForLevel(level) {
  return [...LEVEL_RANKS].reverse().find(rank=>level>=rank.level) || LEVEL_RANKS[0];
}
function nextRankForLevel(level) {
  return LEVEL_RANKS.find(rank=>rank.level>level) || LEVEL_RANKS[LEVEL_RANKS.length-1];
}
function renderLevelRoad(level) {
  const count = 7;
  let start = Math.max(1, level - 2);
  if (start + count - 1 > maxLevel()) start = Math.max(1, maxLevel() - count + 1);
  const milestoneLevels = new Set(LEVEL_RANKS.map(rank=>rank.level));
  $("#levelRoad").innerHTML = Array.from({length:count},(_,i)=>start+i).map(item=>{
    const cls = item < level ? "cleared" : item === level ? "current" : "ahead";
    const milestone = milestoneLevels.has(item) ? " milestone" : "";
    return `<div class="road-level ${cls}${milestone}"><span>${item < level ? "✓" : item}</span><small>${milestone ? rankForLevel(item).title : item === level ? "YOU" : ""}</small></div>`;
  }).join("");
}

function renderToday() {
  const today = new Date();
  const key = localDateKey(today);
  const qs = plannedQuestsFor(today);
  const available = qs.filter(q=>!isCompleted(q.id,key));
  const completed = qs.filter(q=>isCompleted(q.id,key));
  $("#todayXp").textContent = completedXpForDate(today);
  $("#dailyScore").textContent = dailyScoreFor(today);
  $("#momentumScore").textContent = `${momentum()}%`;
  $("#availableQuestCount").textContent = available.length;
  $("#completedQuestCount").textContent = completed.reduce((sum,q)=>sum+completionCount(q.id,key),0);

  const availableList = $("#availableQuests");
  const completedList = $("#completedTodayQuests");
  const completedSection = $("#completedTodaySection");
  if (!qs.length) {
    availableList.innerHTML = `<div class="empty-state">No quests scheduled today. Create one and give the day a target.</div>`;
  } else if (!available.length) {
    availableList.innerHTML = `<div class="empty-state all-cleared">All quests completed today ✨</div>`;
  } else {
    availableList.innerHTML = available.map(q => questCard(q, true, key)).join("");
  }
  completedList.innerHTML = completed.map(q => questCard(q, true, key)).join("");
  completedSection.classList.toggle("hidden", !completed.length);
}

function questCard(q, todayMode=false, dateKey=localDateKey()) {
  const cat = category(q.categoryId);
  const d = difficulty(q.difficulty);
  const done = isCompleted(q.id,dateKey);
  const completedCount = done ? completionCount(q.id,dateKey) : 0;
  const streak = q.type === "recurring" ? questStreak(q,parseLocalDate(dateKey)) : null;
  const streakBadge = todayMode && streak ? `<span class="tile-streak" title="Current streak: ${streak.current} · Best streak: ${streak.best}" aria-label="Current streak ${streak.current}; best streak ${streak.best}">${auraIcon("fire","streak-icon")} ${streak.current}</span>` : "";
  const consistency = !todayMode ? questConsistency(q,parseLocalDate(dateKey)) : null;
  const questProgress = streak && consistency ? `
      <div class="quest-progress-stats">
        <span class="quest-progress-streak" title="Current streak: ${streak.current} · Best streak: ${streak.best}" aria-label="Current streak ${streak.current}; best streak ${streak.best}">${auraIcon("fire","streak-icon")} <strong>${streak.current}</strong> streak</span>
        <span class="quest-progress-lifetime" title="Completed ${consistency.completed} of ${consistency.scheduled} scheduled days since this quest was added" aria-label="Completed ${consistency.completed} of ${consistency.scheduled} scheduled days since this quest was added">✓ <strong>${consistency.completed}/${consistency.scheduled}</strong> completed</span>
        <span class="quest-progress-rate" aria-label="${consistency.percentage} percent completion rate">${consistency.percentage}%</span>
      </div>` : "";
  const repeat = q.type === "oneoff" ? "One-off mission" :
    q.schedule?.mode === "daily" ? "Every day" :
    `Repeats ${weekdayText(q.schedule?.days || [])}`;
  if(todayMode) return `
    <article class="quest-card today-tile ${done ? "completed" : ""}" data-id="${q.id}">
      <div class="tile-copy">
        <div class="quest-title">${escapeHtml(q.title)}</div>
        <div class="tile-category">${escapeHtml(cat.name)}</div>
        ${streakBadge}
        <div class="tile-xp">${d.xp} XP</div>
      </div>
      <button class="tile-hit" data-complete="${q.id}" aria-label="${done ? `Complete ${escapeHtml(q.title)} again` : `Complete ${escapeHtml(q.title)}`}">${done ? `<span class="tile-repeat-action"><strong>+1</strong><small>again</small></span>` : ""}</button>
      ${done ? `<div class="tile-completion-tools">${completedCount > 1 ? `<span class="tile-completion-count" aria-label="Completed ${completedCount} times today">×${completedCount}</span>` : ""}<button type="button" class="tile-undo" data-undo-completion="${q.id}" aria-label="Remove one completion from ${escapeHtml(q.title)}" title="Undo one completion">−</button></div>` : ""}
    </article>`;
  return `
  <article class="quest-card ${reorderMode ? "reorder-item" : ""} ${done ? "completed" : ""}" data-id="${q.id}">
    <div class="quest-card-content">
      <div class="quest-title">${escapeHtml(q.title)}</div>
      <div class="quest-meta">
        <span class="quest-meta-item">${escapeHtml(cat.name)}</span><i class="quest-meta-separator" aria-hidden="true">•</i><span class="quest-meta-item quest-meta-difficulty">${difficultyDot(q.difficulty)}<span>${escapeHtml(d.label)}</span></span><i class="quest-meta-separator" aria-hidden="true">•</i><span class="quest-meta-item quest-meta-schedule">${repeat}</span>
      </div>
      ${questProgress}
    </div>
    ${reorderMode ? `<button type="button" class="drag-handle" data-drag-handle aria-label="Drag ${escapeHtml(q.title)} to reorder" title="Drag to reorder">
          ${auraIcon("drag","quest-card-action-icon")}<span>Drag</span>
        </button>` : `<div class="quest-actions">
          <span class="xp-chip">+${d.xp} XP</span>
          <button type="button" class="mini-btn" data-edit="${q.id}" aria-label="Edit ${escapeHtml(q.title)}" title="Edit">${auraIcon("edit","quest-card-action-icon")}<span class="quest-card-action-label">Edit</span></button>
          <button type="button" class="mini-btn quest-toggle-btn ${q.active ? "is-active" : "is-paused"}" data-toggle="${q.id}" aria-label="${q.active ? "Pause" : "Activate"} ${escapeHtml(q.title)}" title="${q.active ? "Active — tap to pause" : "Paused — tap to activate"}">${auraIcon(q.active ? "active" : "paused","quest-card-action-icon")}<span class="quest-card-action-label">${q.active ? "Active" : "Paused"}</span></button>
          <button type="button" class="mini-btn danger" data-delete="${q.id}" aria-label="Delete ${escapeHtml(q.title)}" title="Delete">${auraIcon("delete","quest-card-action-icon")}</button>
        </div>`}
  </article>`;
}

function weekdayText(days) {
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return days.map(d=>names[d]).join(", ");
}

function isQuestVisibleInLibrary(quest) {
  return !(quest.type === "oneoff" && isQuestEverCompleted(quest.id));
}

function renderQuestLibrary() {
  const qs = state.quests.filter(isQuestVisibleInLibrary)
    .filter(q => questFilter === "all" || q.type === questFilter);
  $("#questLibrary").innerHTML = qs.length ? qs.map(q=>questCard(q,false)).join("") :
    `<div class="empty-state">Nothing here yet.</div>`;
  const reorderButton = $("#reorderBtn");
  reorderButton.classList.toggle("active", reorderMode);
  reorderButton.querySelector("span").textContent = reorderMode ? "Done" : "Sort";
  reorderButton.setAttribute("aria-label",reorderMode ? "Finish sorting quests" : "Sort quests");
  reorderButton.title = reorderMode ? "Finish sorting" : "Sort quests";
  $("#reorderHint").classList.toggle("hidden", !reorderMode);
  $("#questLibrary").classList.toggle("reordering", reorderMode);
}

function renderHistory() {
  renderHistoryCalendar();
  renderDayReview();
}

function renderHistoryCalendar() {
  const month = historyMonth || new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const first = new Date(month.getFullYear(),month.getMonth(),1);
  const lastDay = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const mondayOffset = (first.getDay()+6)%7;
  const start = parseLocalDate(state.startedOn);
  const today = parseLocalDate(localDateKey());
  $("#historyMonthLabel").textContent = new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(first);
  let html = Array.from({length:mondayOffset},()=>`<span class="calendar-spacer"></span>`).join("");
  for(let day=1;day<=lastDay;day++){
    const date = new Date(month.getFullYear(),month.getMonth(),day);
    const key = localDateKey(date);
    const score = dailyScoreFor(date);
    const hasActivity = completedXpForDate(date)>0;
    const disabled = date < start || date > today;
    const cls = score>=80 ? "done" : hasActivity ? "partial" : "empty";
    html += `<button class="calendar-day ${cls}${key===selectedHistoryDate?" selected":""}${key===localDateKey()?" today":""}" data-history-date="${key}" ${disabled?"disabled":""} title="${key}: ${score}/100"><span>${day}</span>${hasActivity?`<i>${score}/100</i>`:""}</button>`;
  }
  $("#historyCalendar").innerHTML = html;
  const startMonth = new Date(start.getFullYear(),start.getMonth(),1);
  const currentMonth = new Date(today.getFullYear(),today.getMonth(),1);
  $("#previousMonthBtn").disabled = first <= startMonth;
  $("#nextMonthBtn").disabled = first >= currentMonth;
}

function questsForReview(date) {
  const key = localDateKey(date);
  const planned = plannedQuestsFor(date);
  const completedIds = Object.entries(state.completions?.[key] || {}).filter(([,done])=>!!done).map(([id])=>id);
  const extras = completedIds
    .filter(id=>!planned.some(p=>p.id===id))
    .map(id=>state.quests.find(q=>q.id===id) || historicalQuestFromCompletion(id,key))
    .filter(Boolean);
  return [...planned, ...extras];
}

function historicalQuestFromCompletion(id,dateKey) {
  const record = completionRecord(id,dateKey);
  if (!record) return null;
  return {
    id,
    title:record.questTitle || "Deleted quest",
    categoryId:record.categoryId,
    difficulty:record.difficulty,
    type:"oneoff",
    schedule:{mode:"once"},
    active:false
  };
}

function renderDayReview() {
  const date = parseLocalDate(selectedHistoryDate || localDateKey());
  const dateKey = localDateKey(date);
  const start = parseLocalDate(state.startedOn);
  const day = daysBetween(date,start) + 1;
  const quests = questsForReview(date);
  const completed = quests.filter(q=>isCompleted(q.id,dateKey));
  const todayKey = localDateKey();
  const editable = isEditableHistoryDate(dateKey);
  $("#reviewDayLabel").textContent = day >= 1 ? `JOURNEY DAY ${day}` : "BEFORE THIS JOURNEY";
  $("#reviewDateLabel").textContent = dateKey === todayKey ? "Today" : new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(date);
  $("#reviewScore").textContent = dailyScoreFor(date);
  $("#reviewXp").textContent = completed.reduce((sum,q)=>sum+completionXp(q.id,dateKey),0);
  $("#reviewClears").textContent = `${completed.length}/${quests.length}`;
  $("#historyEditNotice").classList.toggle("hidden",!editable);
  $("#reviewQuestList").innerHTML = quests.length
    ? quests.map(q=>reviewQuestRow(q,date,dateKey,editable)).join("")
    : `<div class="empty-state compact">No quests were scheduled for this day.</div>`;

  $("#previousDayBtn").disabled = date <= start;
  $("#nextDayBtn").disabled = date >= parseLocalDate(localDateKey());
}

function reviewQuestRow(q,date,dateKey,editableDate) {
  const done = isCompleted(q.id,dateKey);
  const currentQuest = state.quests.find(item=>item.id===q.id) || null;
  const canEdit = editableDate && currentQuest && isScheduledOn(currentQuest,date);
  const detail = canEdit
    ? (done ? `${completionTimeLabel(q.id,dateKey)} · Tap to reopen` : "Tap to mark completed")
    : (done ? completionTimeLabel(q.id,dateKey) : "Not completed");
  const end = canEdit
    ? `<span class="review-edit-action">${done ? "UNDO" : "ADD"}</span>`
    : `<span class="review-xp">${done ? `+${completionXp(q.id,dateKey)} XP` : "—"}</span>`;
  const content = `
    <span class="review-check">${done ? "✓" : "○"}</span>
    <div><strong>${escapeHtml(q.title)}</strong><small>${escapeHtml(detail)}</small></div>
    ${end}`;
  if (!canEdit) return `<div class="review-quest ${done ? "done" : "missed"}">${content}</div>`;
  return `<button type="button" class="review-quest editable ${done ? "done" : "missed"}" data-history-complete="${q.id}" aria-pressed="${done}" aria-label="${done ? "Reopen" : "Mark completed"} ${escapeHtml(q.title)} for yesterday">${content}</button>`;
}

function commitQuestDragOrder(ids) {
  if (!Array.isArray(ids) || !ids.length) return false;
  const byId = new Map(state.quests.map(quest=>[quest.id,quest]));
  const visibleIds = state.quests.filter(isQuestVisibleInLibrary).map(quest=>quest.id);
  if (ids.length !== visibleIds.length || new Set(ids).size !== visibleIds.length || ids.some(id=>!byId.has(id))) return false;
  const previous = state.quests.map(quest=>quest.id);
  const hidden = state.quests.filter(quest=>!ids.includes(quest.id));
  const next = [...ids.map(id=>byId.get(id)),...hidden];
  if (previous.every((id,index)=>id===next[index]?.id)) return false;
  state.quests = next;
  save();
  renderAll();
  showToast("Quest order saved");
  return true;
}

function questOrderIdsFromDom() {
  return $$(".quest-card[data-id]",$("#questLibrary")).map(card=>card.dataset.id);
}

function finishQuestDrag(cancelled=false) {
  if (!questDragState) return;
  const drag = questDragState;
  questDragState = null;
  drag.card.classList.remove("dragging");
  $("#questLibrary").classList.remove("is-dragging");
  if (cancelled) {
    renderQuestLibrary();
    return;
  }
  commitQuestDragOrder(questOrderIdsFromDom());
}

function bindQuestDragAndDrop() {
  const list = $("#questLibrary");
  list.addEventListener("pointerdown",event=>{
    const handle=event.target.closest("[data-drag-handle]");
    const card=handle?.closest(".quest-card[data-id]");
    if(!reorderMode || !handle || !card || (event.button !== undefined && event.button !== 0)) return;
    questDragState={pointerId:event.pointerId,handle,card,lastY:event.clientY};
    handle.setPointerCapture?.(event.pointerId);
    card.classList.add("dragging");
    list.classList.add("is-dragging");
    event.preventDefault();
  });
  list.addEventListener("pointermove",event=>{
    if(!questDragState || event.pointerId!==questDragState.pointerId) return;
    questDragState.lastY=event.clientY;
    const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest(".quest-card[data-id]");
    if(hit && hit!==questDragState.card && hit.parentElement===list){
      const rect=hit.getBoundingClientRect();
      list.insertBefore(questDragState.card,event.clientY < rect.top + rect.height/2 ? hit : hit.nextSibling);
    }
    const edge=72;
    if(event.clientY<edge) window.scrollBy?.({top:-10,behavior:"auto"});
    else if(event.clientY>window.innerHeight-edge) window.scrollBy?.({top:10,behavior:"auto"});
    event.preventDefault();
  });
  list.addEventListener("pointerup",event=>{
    if(!questDragState || event.pointerId!==questDragState.pointerId) return;
    questDragState.handle.releasePointerCapture?.(event.pointerId);
    finishQuestDrag(false);
  });
  list.addEventListener("pointercancel",event=>{
    if(questDragState && event.pointerId===questDragState.pointerId) finishQuestDrag(true);
  });
  list.addEventListener("keydown",event=>{
    const handle=event.target.closest("[data-drag-handle]");
    const card=handle?.closest(".quest-card[data-id]");
    if(!reorderMode || !card || !["ArrowUp","ArrowDown"].includes(event.key)) return;
    const sibling=event.key==="ArrowUp" ? card.previousElementSibling : card.nextElementSibling;
    if(!sibling?.matches(".quest-card[data-id]")) return;
    if(event.key==="ArrowUp") list.insertBefore(card,sibling);
    else list.insertBefore(sibling,card);
    event.preventDefault();
    const focusId=card.dataset.id;
    commitQuestDragOrder(questOrderIdsFromDom());
    $(`.quest-card[data-id="${CSS.escape(focusId)}"] [data-drag-handle]`,list)?.focus();
  });
}

function stepHistoryDay(amount) {
  selectedHistoryDate = localDateKey(addDays(parseLocalDate(selectedHistoryDate), amount));
  const selected = parseLocalDate(selectedHistoryDate);
  historyMonth = new Date(selected.getFullYear(),selected.getMonth(),1);
  renderHistory();
}

function shiftHistoryMonth(amount) {
  historyMonth = new Date(historyMonth.getFullYear(), historyMonth.getMonth()+amount, 1);
  renderHistoryCalendar();
}

function stoicAgeYearForDate(birthDate,date=new Date()) {
  let ageYear = date.getFullYear()-birthDate.getFullYear();
  const anniversary = addCalendarYearsClamped(birthDate,ageYear);
  if (date < anniversary) ageYear -= 1;
  return ageYear;
}

function stoicYearBounds(birthDateKey,ageYear) {
  const birthDate = parseLocalDate(birthDateKey);
  return {
    start:addCalendarYearsClamped(birthDate,ageYear),
    endExclusive:addCalendarYearsClamped(birthDate,ageYear+1)
  };
}

function stoicWeekBounds(birthDateKey,ageYear,weekIndex) {
  const year = stoicYearBounds(birthDateKey,ageYear);
  const days = calendarDaysBetween(year.endExclusive,year.start);
  const startOffset = Math.floor((weekIndex*days)/52);
  const endOffset = Math.max(startOffset+1,Math.floor(((weekIndex+1)*days)/52));
  return {
    start:addDays(year.start,startOffset),
    end:addDays(year.start,endOffset-1)
  };
}

function stoicPositionForDate(birthDateKey,horizonYears,date=new Date()) {
  if (!isValidLocalDateKey(birthDateKey)) return null;
  const birthDate = parseLocalDate(birthDateKey);
  const target = parseLocalDate(localDateKey(date));
  if (target < birthDate) return null;
  const year = stoicAgeYearForDate(birthDate,target);
  const bounds = stoicYearBounds(birthDateKey,year);
  const daysInYear = calendarDaysBetween(bounds.endExclusive,bounds.start);
  const elapsedDays = Math.max(0,calendarDaysBetween(target,bounds.start));
  const week = Math.min(51,Math.floor((elapsedDays*52)/daysInYear));
  return {
    year,week,index:year*52+week,totalWeeks:horizonYears*52,
    withinHorizon:year>=0 && year<horizonYears
  };
}

function stoicWeekRecordKey(ageYear,weekIndex) {
  return `${ageYear}:${String(weekIndex).padStart(2,"0")}`;
}

function stoicTrackingStartDate() {
  const candidates = Object.keys(state.completions || {}).filter(isValidLocalDateKey);
  if (isValidLocalDateKey(state.startedOn)) candidates.push(state.startedOn);
  if (!candidates.length) return parseLocalDate(localDateKey());
  return parseLocalDate(candidates.sort()[0]);
}

function stoicWeekMetrics(start,end,asOf=new Date()) {
  const today = parseLocalDate(localDateKey(asOf));
  const trackingStart = stoicTrackingStartDate();
  const first = start > trackingStart ? start : trackingStart;
  const last = end < today ? end : today;
  if (first > last) return {tracked:false,trackedDays:0,scoreDays:0,averageScore:0,strongDays:0,questClears:0};
  let trackedDays=0,scoreDays=0,scoreTotal=0,strongDays=0,questClears=0;
  for (let date=new Date(first);date<=last;date=addDays(date,1)) {
    const dateKey=localDateKey(date);
    const score=dailyScoreFor(date);
    const hasScore=plannedXpForDate(date)>0;
    const clears=Object.keys(state.completions?.[dateKey] || {}).reduce((sum,id)=>sum+completionCount(id,dateKey),0);
    trackedDays+=1;
    questClears+=clears;
    if (hasScore) {
      scoreDays+=1;
      scoreTotal+=score;
      if (score>=80) strongDays+=1;
    }
  }
  return {
    tracked:true,trackedDays,scoreDays,
    averageScore:scoreDays ? Math.round(scoreTotal/scoreDays) : 0,
    strongDays,questClears
  };
}

function stoicWeekGrade(metrics) {
  if (!metrics?.tracked || metrics.strongDays===0) return 0;
  if (metrics.strongDays>=5) return 3;
  if (metrics.strongDays>=3) return 2;
  return 1;
}

function stoicCellState(ageYear,weekIndex,position,trackingStart,today=new Date()) {
  const index=ageYear*52+weekIndex;
  if (!position?.withinHorizon || index>position.index) return {className:"future",metrics:null};
  const bounds=stoicWeekBounds(state.stoicCalendar.birthDate,ageYear,weekIndex);
  if (bounds.end<trackingStart) {
    const reflected=Boolean(state.stoicCalendar.weeks[stoicWeekRecordKey(ageYear,weekIndex)]);
    return {className:`${index===position.index ? "current " : ""}elapsed${reflected ? " reflected" : ""}`,metrics:null};
  }
  const metrics=stoicWeekMetrics(bounds.start,bounds.end,today);
  const grade=stoicWeekGrade(metrics);
  const classes=["tracked",`grade-${grade}`];
  if (metrics.questClears) classes.push("has-activity");
  if (index===position.index) classes.push("current");
  return {className:classes.join(" "),metrics};
}

function formatStoicDateRange(start,end) {
  const formatter=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"});
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function renderStoicCalendar() {
  const setup=$("#stoicCalendarSetup");
  const content=$("#stoicCalendarContent");
  if (!setup || !content) return;
  const configured=Boolean(state.stoicCalendar.birthDate);
  setup.hidden=configured;
  content.hidden=!configured;
  $("#editStoicCalendarBtn").textContent=configured ? "Edit view" : "Set up";
  if (!configured) return;

  const position=stoicPositionForDate(state.stoicCalendar.birthDate,state.stoicCalendar.horizonYears,new Date());
  if (!position) return;
  if (selectedStoicYear===null || selectedStoicYear<0 || selectedStoicYear>=state.stoicCalendar.horizonYears) {
    selectedStoicYear=position.withinHorizon ? position.year : state.stoicCalendar.horizonYears-1;
    selectedStoicWeek=position.withinHorizon ? position.week : 51;
  } else if (selectedStoicWeek===null || selectedStoicWeek<0 || selectedStoicWeek>51) {
    selectedStoicWeek=selectedStoicYear===position.year ? position.week : selectedStoicYear<position.year ? 51 : 0;
  }
  renderStoicYearView();
}

function renderStoicLifeView() {
  const today=new Date();
  const position=stoicPositionForDate(state.stoicCalendar.birthDate,state.stoicCalendar.horizonYears,today);
  if (!position) return;
  const trackingStart=stoicTrackingStartDate();
  let deliberateWeeks=0;
  const rows=[];
  for (let year=0;year<state.stoicCalendar.horizonYears;year+=1) {
    const cells=[];
    for (let week=0;week<52;week+=1) {
      const cell=stoicCellState(year,week,position,trackingStart,today);
      if (cell.metrics?.strongDays>=4) deliberateWeeks+=1;
      cells.push(`<i class="stoic-week-cell ${cell.className}" aria-hidden="true"></i>`);
    }
    const label=year%5===0 || year===position.year ? year : "";
    rows.push(`<button type="button" class="stoic-life-row${year===position.year?" is-current-year":""}" data-stoic-year="${year}" aria-label="Open life year ${year+1}, age ${year} to ${year+1}"><span class="stoic-year-label">${label}</span><span class="stoic-life-weeks">${cells.join("")}</span></button>`);
  }
  $("#stoicCalendarGrid").innerHTML=rows.join("");
  $("#stoicWeekPosition").textContent=position.withinHorizon ? `${position.index+1} / ${position.totalWeeks}` : `${position.totalWeeks}+`;
  $("#stoicLifeYearStat").textContent=position.year+1;
  $("#stoicDeliberateWeekStat").textContent=deliberateWeeks;
  $("#stoicHorizonLabel").textContent=`${state.stoicCalendar.horizonYears}-year planning horizon`;
}

function renderStoicWeekDetail(ageYear,weekIndex) {
  const detail=$("#stoicWeekDetail");
  const birthDate=state.stoicCalendar.birthDate;
  const position=stoicPositionForDate(birthDate,state.stoicCalendar.horizonYears,new Date());
  const bounds=stoicWeekBounds(birthDate,ageYear,weekIndex);
  const index=ageYear*52+weekIndex;
  const future=!position || index>position.index;
  const trackingStart=stoicTrackingStartDate();
  const beforeTracking=bounds.end<trackingStart;
  const key=stoicWeekRecordKey(ageYear,weekIndex);
  const record=state.stoicCalendar.weeks[key] || {};
  const heading=`Age ${ageYear} · week ${weekIndex+1}`;
  if (future) {
    detail.innerHTML=`<div class="stoic-week-detail-head"><span class="kicker">${escapeHtml(heading)}</span><strong>${escapeHtml(formatStoicDateRange(bounds.start,bounds.end))}</strong></div><div class="empty-state compact">Not lived yet. Leave it open and return to the present week.</div>`;
    return;
  }
  if (beforeTracking && !record.intention && !record.control && !record.reaction && !record.correction) {
    detail.innerHTML=`<div class="stoic-week-detail-head"><span class="kicker">${escapeHtml(heading)}</span><strong>${escapeHtml(formatStoicDateRange(bounds.start,bounds.end))}</strong></div><div class="empty-state compact">This week came before Level90 tracking began. It is elapsed time, not a failed week.</div>`;
    return;
  }
  const metrics=stoicWeekMetrics(bounds.start,bounds.end,new Date());
  detail.innerHTML=`
    <div class="stoic-week-detail-head"><span class="kicker">${escapeHtml(heading)}</span><strong>${escapeHtml(formatStoicDateRange(bounds.start,bounds.end))}</strong></div>
    <div class="stoic-week-stats">
      <div><strong>${metrics.averageScore}</strong><span>Average score</span></div>
      <div><strong>${metrics.strongDays}</strong><span>80+ days</span></div>
      <div><strong>${metrics.questClears}</strong><span>Quest clears</span></div>
    </div>
    <div class="stoic-reflection-fields" data-stoic-record="${key}">
      <label>What was within my control?<textarea data-stoic-field="intention" maxlength="${STOIC_TEXT_LIMITS.intention}" placeholder="Choose the response, action or standard that belongs to you.">${escapeHtml(record.intention || "")}</textarea></label>
      <label>What did I handle well?<textarea data-stoic-field="control" maxlength="${STOIC_TEXT_LIMITS.control}" placeholder="Name the choices that reflected your character.">${escapeHtml(record.control || "")}</textarea></label>
      <label>Where did I react instead of choose?<textarea data-stoic-field="reaction" maxlength="${STOIC_TEXT_LIMITS.reaction}" placeholder="Observe it without turning the review into punishment.">${escapeHtml(record.reaction || "")}</textarea></label>
      <label>One correction for the next week<textarea data-stoic-field="correction" maxlength="${STOIC_TEXT_LIMITS.correction}" placeholder="Keep the correction specific and within your control.">${escapeHtml(record.correction || "")}</textarea></label>
    </div>`;
}

function renderStoicYearView() {
  if (selectedStoicYear===null) return;
  const position=stoicPositionForDate(state.stoicCalendar.birthDate,state.stoicCalendar.horizonYears,new Date());
  const trackingStart=stoicTrackingStartDate();
  $("#stoicYearTitle").textContent=`Age ${selectedStoicYear}–${selectedStoicYear+1}`;
  const year=stoicYearBounds(state.stoicCalendar.birthDate,selectedStoicYear);
  $("#stoicYearDates").textContent=formatStoicDateRange(year.start,addDays(year.endExclusive,-1));
  $("#stoicYearWeekGrid").innerHTML=Array.from({length:52},(_,week)=>{
    const cell=stoicCellState(selectedStoicYear,week,position,trackingStart,new Date());
    return `<button type="button" class="stoic-zoom-week ${cell.className}${week===selectedStoicWeek?" selected":""}" data-stoic-week="${week}" aria-label="Week ${week+1}" aria-pressed="${week===selectedStoicWeek}">${week+1}</button>`;
  }).join("");
  renderStoicWeekDetail(selectedStoicYear,selectedStoicWeek);
}

function selectStoicYear(ageYear,weekIndex=null) {
  const position=stoicPositionForDate(state.stoicCalendar.birthDate,state.stoicCalendar.horizonYears,new Date());
  selectedStoicYear=Math.max(0,Math.min(state.stoicCalendar.horizonYears-1,Number(ageYear)));
  selectedStoicWeek=weekIndex===null
    ? selectedStoicYear===position?.year ? position.week : selectedStoicYear<(position?.year ?? 0) ? 51 : 0
    : Math.max(0,Math.min(51,Number(weekIndex)));
  renderStoicYearView();
  const dialog=$("#stoicLifeDialog");
  if (dialog.open) dialog.close();
}

function openStoicLifeDialog() {
  renderStoicLifeView();
  const dialog=$("#stoicLifeDialog");
  if (!dialog.open) dialog.showModal();
}

function openStoicSetupDialog() {
  $("#stoicBirthDateInput").value=state.stoicCalendar.birthDate || "";
  $("#stoicBirthDateInput").max=localDateKey();
  $("#stoicHorizonInput").value=state.stoicCalendar.horizonYears || STOIC_DEFAULT_HORIZON;
  $("#stoicSetupError").textContent="";
  $("#stoicSetupDialog").showModal();
}

function saveStoicSetup(event) {
  event.preventDefault();
  const birthDate=$("#stoicBirthDateInput").value;
  const horizonYears=Math.round(Number($("#stoicHorizonInput").value));
  const error=$("#stoicSetupError");
  if (!isValidLocalDateKey(birthDate) || birthDate>localDateKey()) {
    error.textContent="Enter a valid date of birth.";
    return;
  }
  if (horizonYears<STOIC_MIN_HORIZON || horizonYears>STOIC_MAX_HORIZON) {
    error.textContent=`Choose a horizon from ${STOIC_MIN_HORIZON} to ${STOIC_MAX_HORIZON} years.`;
    return;
  }
  const position=stoicPositionForDate(birthDate,horizonYears,new Date());
  if (!position?.withinHorizon) {
    error.textContent="Choose a planning horizon beyond your current age.";
    return;
  }
  state.stoicCalendar=normalizeStoicCalendar({...state.stoicCalendar,birthDate,horizonYears});
  selectedStoicYear=null;
  selectedStoicWeek=null;
  save();
  renderCharacter();
  $("#stoicSetupDialog").close();
  showToast("Stoic Calendar updated");
}

function saveStoicWeekField(recordKey,field,value) {
  if (!Object.hasOwn(STOIC_TEXT_LIMITS,field)) return;
  const record={
    intention:"",control:"",reaction:"",correction:"",
    ...(state.stoicCalendar.weeks[recordKey] || {})
  };
  record[field]=normalizeStoicText(value,STOIC_TEXT_LIMITS[field]).trim();
  record.updatedAt=new Date().toISOString();
  if (record.intention || record.control || record.reaction || record.correction) state.stoicCalendar.weeks[recordKey]=record;
  else delete state.stoicCalendar.weeks[recordKey];
  save();
  showToast("Stoic reflection saved");
}

function renderCharacter() {
  const overallLevel = levelFromXp(totalXp());
  const nextRank = nextRankForLevel(overallLevel);
  $("#nextMilestoneTitle").textContent = overallLevel >= maxLevel() ? "Ascended" : nextRank.title;
  $("#nextMilestoneText").textContent = overallLevel >= maxLevel()
    ? "You reached Level 90. Every quest now strengthens the character you built."
    : `Reach Level ${nextRank.level} to unlock this rank.`;
  $("#characterStats").innerHTML = state.categories.map(c => {
    const xp = categoryXp(c.id), p = levelProgress(xp);
    return `<div class="character-row">
      <div class="character-top">
        <strong>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</strong><span>LEVEL ${p.lvl} · ${xp} XP</span>
      </div>
      <div class="character-progress"><i style="width:${p.pct}%"></i></div>
    </div>`;
  }).join("");
  $("#totalXpStat").textContent = totalXp();
  $("#completedQuestStat").textContent = Object.entries(state.completions).reduce((sum,[dateKey,day])=>{
    return sum+Object.keys(day || {}).reduce((daySum,id)=>daySum+completionCount(id,dateKey),0);
  },0);
  $("#strongDayStat").textContent = strongDayCount();
  renderStoicCalendar();
}

function toggleQuestCompletionForDate(id,dateKey,completedAt=new Date().toISOString()) {
  const q = state.quests.find(x=>x.id===id);
  if (!q) return null;
  state.completions[dateKey] ||= {};
  const wasDone = !!state.completions[dateKey][id];
  if (wasDone) {
    delete state.completions[dateKey][id];
    if (!Object.keys(state.completions[dateKey]).length) delete state.completions[dateKey];
  } else state.completions[dateKey][id] = normalizeCompletionRecord({
    completedAt,
    questTitle:q.title,
    categoryId:q.categoryId,
    difficulty:q.difficulty,
    xpAwarded:xpForQuest(q)
  },q,dateKey);
  return {q,wasDone};
}

function addQuestCompletionForDate(id,dateKey,completedAt=new Date().toISOString()) {
  const q = state.quests.find(x=>x.id===id);
  if (!q) return null;
  const existing = completionRecord(id,dateKey);
  state.completions[dateKey] ||= {};
  state.completions[dateKey][id] = normalizeCompletionRecord({
    ...(existing || {}),
    completedAt,
    questTitle:existing?.questTitle || q.title,
    categoryId:existing?.categoryId || q.categoryId,
    difficulty:existing?.difficulty || q.difficulty,
    xpAwarded:existing?.xpAwarded ?? xpForQuest(q),
    count:(existing?.count || 0)+1
  },q,dateKey);
  return {q,previousCount:existing?.count || 0,count:(existing?.count || 0)+1};
}

function removeQuestCompletionForDate(id,dateKey) {
  const q = state.quests.find(x=>x.id===id);
  const existing = completionRecord(id,dateKey);
  if (!q || !existing) return null;
  if (existing.count > 1) {
    state.completions[dateKey][id] = normalizeCompletionRecord({...existing,count:existing.count-1},q,dateKey);
  } else {
    delete state.completions[dateKey][id];
    if (!Object.keys(state.completions[dateKey]).length) delete state.completions[dateKey];
  }
  return {q,previousCount:existing.count,count:existing.count-1};
}

function toggleComplete(id, button) {
  const key = localDateKey();
  const oldLevel = levelFromXp(totalXp());
  const change = addQuestCompletionForDate(id,key);
  if (!change) return;
  const {q,count} = change;

  save();
  const newLevel = levelFromXp(totalXp());
  xpPop(button, xpForQuest(q));
  if (navigator.vibrate) navigator.vibrate([18,30,18]);
  if (newLevel > oldLevel) showLevelUp(newLevel);
  else showToast(count > 1 ? `Cleared again · +${xpForQuest(q)} XP · ×${count} today` : `Quest cleared · +${xpForQuest(q)} XP`);
  renderAll();
}

function undoTodayCompletion(id) {
  const change = removeQuestCompletionForDate(id,localDateKey());
  if (!change) return;
  save();
  showToast(change.count > 0 ? `One clear removed · ×${change.count} today` : "Quest reopened");
  renderAll();
}

function toggleHistoryCompletion(id) {
  const key = selectedHistoryDate;
  if (!key || !isEditableHistoryDate(key)) {
    showToast("Only yesterday can be edited");
    renderHistory();
    return;
  }
  const date = parseLocalDate(key);
  const q = state.quests.find(item=>item.id===id);
  if (!q || !isScheduledOn(q,date)) return;
  const oldLevel = levelFromXp(totalXp());
  const change = toggleQuestCompletionForDate(id,key,completionFallbackTimestamp(key));
  if (!change) return;
  save();
  const newLevel = levelFromXp(totalXp());
  if (!change.wasDone && newLevel > oldLevel) showLevelUp(newLevel);
  else showToast(change.wasDone ? "Yesterday's correction removed" : `Yesterday corrected · +${xpForQuest(q)} XP`);
  renderAll();
}

function xpPop(anchor, xp) {
  const r = anchor.getBoundingClientRect();
  const orb = $("#levelOrb");
  const target = orb.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "xp-flight";
  el.textContent = `+${xp} XP`;
  el.style.left = `${r.left + r.width/2}px`;
  el.style.top = `${r.top + r.height/2}px`;
  el.style.setProperty("--travel-x",`${target.left + target.width/2 - (r.left + r.width/2)}px`);
  el.style.setProperty("--travel-y",`${target.top + target.height/2 - (r.top + r.height/2)}px`);
  document.body.appendChild(el);
  setTimeout(()=>{
    orb.classList.remove("charging"); void orb.offsetWidth; orb.classList.add("charging");
  },520);
  setTimeout(()=>{el.remove();orb.classList.remove("charging")},1050);
}
function showLevelUp(level) {
  $("#levelUpNumber").textContent = level;
  const o=$("#levelUpOverlay");
  o.classList.remove("show");
  void o.offsetWidth;
  o.classList.add("show");
}
function showToast(msg) {
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.classList.remove("show"),1600);
}

function renderIconPicker(pickerId, searchValue, selectedIcon) {
  const query = String(searchValue || "").trim().toLowerCase();
  const matches = ICON_LIBRARY.filter(item=>!query || `${item.icon} ${item.keywords}`.includes(query));
  const picker = $(`#${pickerId}`);
  picker.innerHTML = matches.length ? matches.map(item=>`
    <button type="button" class="icon-choice ${item.icon===selectedIcon?"selected":""}" data-icon="${item.icon}" title="${escapeHtml(item.keywords)}">${item.icon}</button>
  `).join("") : `<span class="icon-empty">No common icons found. You can paste any emoji.</span>`;
}

function openQuestDialog(quest=null) {
  $("#questForm").reset();
  if (!state.categories.length) {
    showToast("Add a category before creating a quest");
    openCategoryDialog();
    return;
  }
  const editing = quest && quest.id ? quest : null;
  const type = editing?.type || "recurring";
  const schedule = editing?.schedule?.mode || (type==="oneoff" ? "once" : "daily");
  $("#questCategory").innerHTML = state.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join("");
  $("#questDialog").dataset.editingId=editing?.id || "";
  $("#questDialog").dataset.type=type;
  $("#questDialog").dataset.schedule=schedule;
  $("#questDialog").dataset.difficulty=editing?.difficulty || "medium";
  $("#questDialogKicker").textContent=editing ? "EDIT MISSION" : "NEW MISSION";
  $("#questDialogTitle").textContent=editing ? "Edit quest" : "Create quest";
  $("#questSubmitBtn").textContent=editing ? "Save changes" : "Create quest";
  $("#questTitle").value=editing?.title || "";
  const selectedCategory=state.categories.some(c=>c.id===editing?.categoryId) ? editing.categoryId : state.categories[0].id;
  $("#questCategory").value=selectedCategory;
  $$(".segment[data-type]").forEach(b=>b.classList.toggle("active",b.dataset.type===type));
  $$(".segment[data-schedule]").forEach(b=>b.classList.toggle("active",b.dataset.schedule===schedule));
  $$("#weekdayPicker button").forEach(b=>b.classList.toggle("selected",(editing?.schedule?.days || []).includes(Number(b.dataset.day))));
  $("#scheduleFields").classList.toggle("hidden",type==="oneoff");
  $("#weekdayPicker").classList.toggle("hidden",schedule!=="weekdays");
  renderDifficulty();
  $("#questDialog").showModal();
}
function renderDifficulty() {
  const p=$("#difficultyPicker");
  if(!p) return;
  const selected=$("#questDialog").dataset.difficulty || "medium";
  p.innerHTML=Object.entries(CONFIG.difficulty).map(([id,d])=>`
    <button type="button" class="difficulty-btn ${id===selected?"selected":""}" data-difficulty="${id}">
      <span class="difficulty-option-label">${difficultyDot(id)}<span>${escapeHtml(d.label)}</span></span><small>${d.xp} XP</small>
    </button>`).join("");
  $("#difficultyXpHint").textContent=`This quest will award ${difficulty(selected).xp} XP. XP is fixed by difficulty.`;
}

function saveQuest(e) {
  e.preventDefault();
  const title=$("#questTitle").value.trim();
  if(!title) return;
  const type=$("#questDialog").dataset.type || "recurring";
  const mode= type==="oneoff" ? "once" : ($("#questDialog").dataset.schedule || "daily");
  const days=$$("#weekdayPicker button.selected").map(b=>Number(b.dataset.day));
  if(type==="recurring" && mode==="weekdays" && !days.length){
    showToast("Choose at least one day");
    return;
  }
  const editingId=$("#questDialog").dataset.editingId;
  const existing=state.quests.find(q=>q.id===editingId);
  const questData={
    title,
    categoryId:$("#questCategory").value,
    difficulty:$("#questDialog").dataset.difficulty || "medium",
    type,
    schedule: mode==="weekdays" ? {mode,days} : {mode},
  };
  if(existing){ Object.assign(existing,questData); delete existing.icon; }
  else state.quests.push({id:uid(),createdOn:localDateKey(),createdAt:new Date().toISOString(),...questData,active:true});
  save();
  $("#questDialog").close();
  renderAll();
  showToast(existing ? "Quest updated" : "Quest added to your log");
}

function refreshCategoryIconPicker() {
  renderIconPicker("categoryIconPicker",$("#categoryIconSearch").value,$("#categoryIconInput").value.trim());
}

function resetCategoryForm() {
  $("#categoryForm").reset();
  $("#categoryForm").dataset.editingId="";
  $("#categoryIconInput").value="✨";
  $("#categoryFormKicker").textContent="ADD CATEGORY";
  $("#categorySubmitBtn").textContent="Add category";
  $("#categoryCancelEditBtn").classList.add("hidden");
  refreshCategoryIconPicker();
}

function renderCategoryManager() {
  const list=$("#categoryList");
  list.innerHTML=state.categories.length ? state.categories.map(c=>{
    const useCount=state.quests.filter(q=>q.categoryId===c.id).length;
    return `<article class="category-manager-item">
      <span class="category-manager-icon">${escapeHtml(c.icon)}</span>
      <div><strong>${escapeHtml(c.name)}</strong><small>${useCount} ${useCount===1?"quest":"quests"}${c.description?` · ${escapeHtml(c.description)}`:""}</small></div>
      <div class="category-manager-actions">
        <button type="button" class="mini-btn" data-category-edit="${c.id}">Edit</button>
        <button type="button" class="mini-btn ${useCount?"locked":"danger"}" data-category-delete="${c.id}" ${useCount?"disabled":""} title="${useCount?"Reassign its quests before deleting":"Delete category"}">${useCount?"In use":"Delete"}</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty-state compact">No categories yet. Add your first one below.</div>`;
}

function openCategoryDialog() {
  resetCategoryForm();
  renderCategoryManager();
  $("#categoryDialog").showModal();
}

function editCategory(id) {
  const c=state.categories.find(item=>item.id===id);
  if(!c) return;
  $("#categoryForm").dataset.editingId=c.id;
  $("#categoryNameInput").value=c.name;
  $("#categoryIconInput").value=c.icon || "✨";
  $("#categoryDescriptionInput").value=c.description || "";
  $("#categoryFormKicker").textContent="EDIT CATEGORY";
  $("#categorySubmitBtn").textContent="Save changes";
  $("#categoryCancelEditBtn").classList.remove("hidden");
  refreshCategoryIconPicker();
  $("#categoryNameInput").focus();
}

function saveCategory(e) {
  e.preventDefault();
  const name=$("#categoryNameInput").value.trim();
  const editingId=$("#categoryForm").dataset.editingId;
  if(!name) return;
  const duplicate=state.categories.find(c=>c.id!==editingId && c.name.toLowerCase()===name.toLowerCase());
  if(duplicate){ showToast("That category name already exists"); return; }
  const data={name,icon:$("#categoryIconInput").value.trim() || "✨",description:$("#categoryDescriptionInput").value.trim()};
  const existing=state.categories.find(c=>c.id===editingId);
  if(existing) Object.assign(existing,data);
  else state.categories.push({id:categoryUid(),createdAt:new Date().toISOString(),...data});
  save(); renderAll(); renderCategoryManager(); resetCategoryForm();
  showToast(existing ? "Category updated" : "Category added");
}

function deleteCategory(id) {
  const c=state.categories.find(item=>item.id===id);
  if(!c) return;
  const useCount=state.quests.filter(q=>q.categoryId===id).length;
  if(useCount){ showToast(`Reassign ${useCount} ${useCount===1?"quest":"quests"} first`); return; }
  if(!confirm(`Delete the “${c.name}” category?`)) return;
  state.categories=state.categories.filter(item=>item.id!==id);
  save(); renderAll(); renderCategoryManager(); resetCategoryForm();
  showToast("Category deleted");
}

function bindEvents() {
  $$(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
    showView(btn.dataset.view);
  }));
  window.addEventListener("hashchange",()=>showView(viewFromLocation(),{updateHash:false}));

  $("#quickAddBtn").addEventListener("click",()=>openQuestDialog());
  $("#addQuestBtn").addEventListener("click",()=>openQuestDialog());
  $("#manageCategoriesBtn").addEventListener("click",openCategoryDialog);
  $("#reorderBtn").addEventListener("click",()=>{
    reorderMode=!reorderMode;
    if(reorderMode){
      questFilter="all";
      $$(".filter-chip").forEach(x=>x.classList.toggle("active",x.dataset.filter==="all"));
    }
    renderQuestLibrary();
  });
  bindQuestDragAndDrop();
  $("#closeQuestDialog").addEventListener("click",()=>$("#questDialog").close());
  $("#questForm").addEventListener("submit",saveQuest);
  $("#closeCategoryDialog").addEventListener("click",()=>$("#categoryDialog").close());
  $("#categoryForm").addEventListener("submit",saveCategory);
  $("#categoryCancelEditBtn").addEventListener("click",resetCategoryForm);
  $("#categoryIconSearch").addEventListener("input",refreshCategoryIconPicker);
  $("#categoryIconInput").addEventListener("input",refreshCategoryIconPicker);
  $("#categoryIconPicker").addEventListener("click",e=>{
    const option=e.target.closest("[data-icon]"); if(!option)return;
    $("#categoryIconInput").value=option.dataset.icon; refreshCategoryIconPicker();
  });

  $("#difficultyPicker").addEventListener("click",e=>{
    const b=e.target.closest("[data-difficulty]"); if(!b)return;
    $("#questDialog").dataset.difficulty=b.dataset.difficulty; renderDifficulty();
  });

  $$(".segment[data-type]").forEach(b=>b.addEventListener("click",()=>{
    $$(".segment[data-type]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("#questDialog").dataset.type=b.dataset.type;
    $("#scheduleFields").classList.toggle("hidden",b.dataset.type==="oneoff");
    if(b.dataset.type==="recurring" && !["daily","weekdays"].includes($("#questDialog").dataset.schedule)){
      $("#questDialog").dataset.schedule="daily";
      $$(".segment[data-schedule]").forEach(x=>x.classList.toggle("active",x.dataset.schedule==="daily"));
      $("#weekdayPicker").classList.add("hidden");
    }
  }));
  $$(".segment[data-schedule]").forEach(b=>b.addEventListener("click",()=>{
    $$(".segment[data-schedule]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("#questDialog").dataset.schedule=b.dataset.schedule;
    $("#weekdayPicker").classList.toggle("hidden",b.dataset.schedule!=="weekdays");
  }));
  $$("#weekdayPicker button").forEach(b=>b.addEventListener("click",()=>b.classList.toggle("selected")));

  document.addEventListener("click",e=>{
    const historyCompletion=e.target.closest("[data-history-complete]");
    if(historyCompletion){
      toggleHistoryCompletion(historyCompletion.dataset.historyComplete);
      return;
    }
    const undoCompletion=e.target.closest("[data-undo-completion]");
    if(undoCompletion){
      undoTodayCompletion(undoCompletion.dataset.undoCompletion);
      return;
    }
    const c=e.target.closest("[data-complete]");
    if(c){
      toggleComplete(c.dataset.complete,c);
      return;
    }
    const t=e.target.closest("[data-toggle]");
    if(t){
      const q=state.quests.find(x=>x.id===t.dataset.toggle);
      if(q){q.active=!q.active;save();renderAll();}
    }
    const edit=e.target.closest("[data-edit]");
    if(edit){
      const q=state.quests.find(x=>x.id===edit.dataset.edit);
      if(q) openQuestDialog(q);
    }
    const d=e.target.closest("[data-delete]");
    if(d){
      const q=state.quests.find(x=>x.id===d.dataset.delete);
      if(q && confirm(`Delete "${q.title}"? Its completion history and earned XP will be preserved.`)){
        state.quests=state.quests.filter(x=>x.id!==q.id); save(); renderAll();
      }
    }
    const categoryEdit=e.target.closest("[data-category-edit]");
    if(categoryEdit) editCategory(categoryEdit.dataset.categoryEdit);
    const categoryDelete=e.target.closest("[data-category-delete]");
    if(categoryDelete) deleteCategory(categoryDelete.dataset.categoryDelete);
    const historyDay=e.target.closest("[data-history-date]");
    if(historyDay && !historyDay.disabled){
      selectedHistoryDate=historyDay.dataset.historyDate;
      const selected=parseLocalDate(selectedHistoryDate);
      historyMonth=new Date(selected.getFullYear(),selected.getMonth(),1);
      renderHistory();
    }
    const stoicYear=e.target.closest("[data-stoic-year]");
    if(stoicYear){
      selectStoicYear(stoicYear.dataset.stoicYear);
      return;
    }
    const stoicWeek=e.target.closest("[data-stoic-week]");
    if(stoicWeek){
      selectedStoicWeek=Number(stoicWeek.dataset.stoicWeek);
      renderStoicYearView();
    }
  });

  $("#previousDayBtn").addEventListener("click",()=>stepHistoryDay(-1));
  $("#nextDayBtn").addEventListener("click",()=>stepHistoryDay(1));
  $("#previousMonthBtn").addEventListener("click",()=>shiftHistoryMonth(-1));
  $("#nextMonthBtn").addEventListener("click",()=>shiftHistoryMonth(1));

  $("#setupStoicCalendarBtn").addEventListener("click",openStoicSetupDialog);
  $("#editStoicCalendarBtn").addEventListener("click",openStoicSetupDialog);
  $("#closeStoicSetupDialog").addEventListener("click",()=>$("#stoicSetupDialog").close());
  $("#stoicSetupForm").addEventListener("submit",saveStoicSetup);
  $("#stoicShowLifeBtn").addEventListener("click",openStoicLifeDialog);
  $("#closeStoicLifeDialog").addEventListener("click",()=>$("#stoicLifeDialog").close());
  $("#stoicWeekDetail").addEventListener("change",e=>{
    const field=e.target.closest("[data-stoic-field]");
    const container=e.target.closest("[data-stoic-record]");
    if(field && container) saveStoicWeekField(container.dataset.stoicRecord,field.dataset.stoicField,field.value);
  });

  $$(".filter-chip").forEach(b=>b.addEventListener("click",()=>{
    if(reorderMode) return;
    questFilter=b.dataset.filter;
    $$(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));
    renderQuestLibrary();
  }));

  $("#themeBtn").addEventListener("click",()=>{
    state.theme = state.theme==="dark" ? "light":"dark";
    applyTheme(); save();
  });

  $("#themeModePicker").addEventListener("click",e=>{
    const option=e.target.closest("[data-theme-mode]"); if(!option)return;
    state.theme=option.dataset.themeMode; applyTheme(); save();
  });
  $("#palettePicker").addEventListener("click",e=>{
    const option=e.target.closest("[data-palette]"); if(!option)return;
    state.palette=option.dataset.palette; applyTheme(); save();
    showToast(`${option.querySelector("strong").textContent} activated`);
  });

  $("#menuBtn").addEventListener("click",openSettingsPage);
  $("#profileGreetingBtn").addEventListener("click",openSettingsPage);
  $("#closeSettings").addEventListener("click",closeSettingsPage);
  $("#closeNotifications").addEventListener("click",closeNotificationsPage);
  $("#profileNameInput").addEventListener("input",e=>{
    state.profileName=e.target.value.trimStart();
    $("#greetingName").textContent=state.profileName || "Player";
    save();
  });
  $("#nameDialog").addEventListener("cancel",e=>e.preventDefault());
  $("#nameForm").addEventListener("submit",e=>{
    e.preventDefault();
    const name=$("#nameInput").value.trim();
    if(!name) return;
    state.profileName=name;
    $("#greetingName").textContent=name;
    $("#profileNameInput").value=name;
    save();
    $("#nameDialog").close();
    showToast(`Welcome, ${name}`);
  });

  $("#exportBtn").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`level90-backup-${localDateKey()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  });

  $("#importInput").addEventListener("change",async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    try{
      const incoming=JSON.parse(await file.text());
      if(!incoming.quests || !incoming.categories) throw new Error();
      state=incoming; selectedHistoryDate=localDateKey(); historyMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1); migrateState(); save(); renderAll(); closeSettingsPage(); showToast("Backup restored");
    }catch{ alert("That file does not look like a valid Level 90 backup."); }
    e.target.value="";
  });

  $("#startChallengeBtn").addEventListener("click",()=>{
    if(confirm("Start a fresh journey today? Your quest definitions are kept, but XP and completion history are cleared.")){
      state.startedOn=localDateKey(); state.completions={}; selectedHistoryDate=localDateKey(); historyMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1); save(); renderAll(); closeSettingsPage(); showToast("Fresh journey started");
    }
  });

  $("#resetBtn").addEventListener("click",()=>{
    if(confirm("Reset everything to the original Level 90 starter data?")){
      state=freshState(); selectedHistoryDate=localDateKey(); historyMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1); save(); document.body.classList.remove("light"); renderAll(); closeSettingsPage(); showToast("App reset");
    }
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
    navigator.serviceWorker.addEventListener("message",event=>{
      if (event.data?.type === "LEVEL90_OPEN_VIEW") showView(event.data.view || "today");
      if (event.data?.type === "LEVEL90_NOTIFICATION_RECEIVED" && typeof refreshLevel90NotificationInbox === "function") {
        refreshLevel90NotificationInbox({silent:true}).catch(()=>{});
        window.setTimeout(()=>refreshLevel90NotificationInbox({silent:true}).catch(()=>{}),1500);
        window.setTimeout(()=>refreshLevel90NotificationInbox({silent:true}).catch(()=>{}),4500);
      }
    });
  }
}
bootstrap();
