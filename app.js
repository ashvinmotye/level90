
const STORAGE_KEY = "level90-state-v1";
let CONFIG = null;
let state = null;
let questFilter = "all";
let reorderMode = false;
let selectedHistoryDate = null;
let historyMonth = null;
let levelGlowAnimation = null;
const PALETTES = ["arctic","jade","aurora","rose"];
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
function daysBetween(a,b) {
  const x = new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const y = new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.floor((x-y)/86400000);
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
  save();
  bindEvents();
  renderAll();
  startLevelNumberGlow();
  registerSW();
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
    startedOn: localDateKey(),
    quests: structuredClone(CONFIG.quests),
    categories: structuredClone(CONFIG.categories),
    completions: {},
    theme: "dark",
    palette: "arctic",
    profileName: ""
  };
}
function migrateState() {
  state.quests ||= structuredClone(CONFIG.quests);
  state.categories ||= structuredClone(CONFIG.categories);
  state.completions ||= {};
  state.startedOn ||= localDateKey();
  state.theme ||= "dark";
  if (!PALETTES.includes(state.palette)) state.palette = "arctic";
  state.profileName = typeof state.profileName === "string" ? state.profileName.trim() : "";
  state.categories.forEach(c=>{ c.icon ||= "✨"; });
  state.quests.forEach(q=>{ delete q.icon; });
  selectedHistoryDate ||= localDateKey();
  historyMonth ||= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  applyTheme();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function requestNameIfNeeded() {
  const dialog=$("#nameDialog");
  if(state.profileName || !dialog || dialog.open || $("#settingsDialog")?.open) return;
  $("#nameInput").value="";
  dialog.showModal();
  setTimeout(()=>$("#nameInput").focus(),0);
}

function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  document.body.dataset.palette = state.palette || "arctic";
  const quickToggle = $("#themeBtn");
  if (quickToggle) quickToggle.textContent = state.theme === "dark" ? "☀" : "☾";
  $$("[data-theme-mode]").forEach(button=>button.classList.toggle("selected",button.dataset.themeMode===state.theme));
  $$("[data-palette]").forEach(button=>button.classList.toggle("selected",button.dataset.palette===state.palette));
  const browserColor=getComputedStyle(document.body).getPropertyValue("--bg").trim();
  const themeMeta=$("meta[name='theme-color']");
  if(themeMeta && browserColor) themeMeta.setAttribute("content",browserColor);
}

function difficulty(id) { return CONFIG.difficulty[id] || CONFIG.difficulty.easy; }
function category(id) { return state.categories.find(c => c.id === id) || {name:"Other",icon:"✨"}; }

function xpForQuest(q) { return difficulty(q.difficulty).xp; }

function isScheduledOn(q, date) {
  if (!q.active) return false;
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
  const value = completionValue(id, dateKey);
  if (typeof value !== "string") return "Completed";
  const completedAt = new Date(value);
  if (Number.isNaN(completedAt.getTime())) return "Completed";
  return `Completed at ${new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(completedAt)}`;
}
function isQuestEverCompleted(id) {
  return Object.values(state.completions || {}).some(day => !!day[id]);
}

function plannedQuestsFor(date) {
  return state.quests.filter(q => isScheduledOn(q,date));
}
function completedXpForDate(date) {
  const key = localDateKey(date);
  return plannedQuestsFor(date).reduce((sum,q) => sum + (isCompleted(q.id,key) ? xpForQuest(q) : 0), 0);
}
function plannedXpForDate(date) {
  return plannedQuestsFor(date).reduce((sum,q) => sum + xpForQuest(q), 0);
}
function dailyScoreFor(date) {
  const planned = plannedXpForDate(date);
  if (!planned) return 0;
  return Math.round((completedXpForDate(date) / planned) * 100);
}
function totalXp() {
  let total = 0;
  Object.entries(state.completions).forEach(([dateKey, completions]) => {
    Object.keys(completions).forEach(id => {
      if (completions[id]) {
        const q = state.quests.find(x=>x.id===id);
        if (q) total += xpForQuest(q);
      }
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
  Object.values(state.completions).forEach(day => {
    Object.entries(day).forEach(([id,done]) => {
      const q = state.quests.find(x=>x.id===id);
      if (done && q?.categoryId === catId) total += xpForQuest(q);
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
  $("#todayXp").textContent = completedXpForDate(today);
  $("#dailyScore").textContent = dailyScoreFor(today);
  $("#momentumScore").textContent = `${momentum()}%`;

  const list = $("#todayQuests");
  if (!qs.length) {
    list.innerHTML = `<div class="empty-state">No quests scheduled today. Create one and give the day a target.</div>`;
  } else {
    list.innerHTML = qs.map(q => questCard(q, true, key)).join("");
  }
}

function questCard(q, todayMode=false, dateKey=localDateKey()) {
  const cat = category(q.categoryId);
  const d = difficulty(q.difficulty);
  const done = isCompleted(q.id,dateKey);
  const repeat = q.type === "oneoff" ? "One-off mission" :
    q.schedule?.mode === "daily" ? "Every day" :
    `Repeats ${weekdayText(q.schedule?.days || [])}`;
  if(todayMode) return `
    <article class="quest-card today-tile ${done ? "completed" : ""}" data-id="${q.id}">
      <div class="tile-copy">
        <div class="quest-title">${escapeHtml(q.title)}</div>
        <div class="tile-category">${escapeHtml(cat.name)}</div>
        <div class="tile-xp">${d.xp} XP</div>
      </div>
      <button class="tile-hit" data-complete="${q.id}" aria-label="${done ? "Reopen" : "Complete"} ${escapeHtml(q.title)}">${done ? "✓" : ""}</button>
    </article>`;
  return `
  <article class="quest-card ${done ? "completed" : ""}" data-id="${q.id}">
    <div>
      <div class="quest-title">${escapeHtml(q.title)}</div>
      <div class="quest-meta">
        <span>${escapeHtml(cat.name)}</span><span>•</span><span>${d.icon} ${d.label}</span><span>•</span><span>${repeat}</span>
      </div>
    </div>
    ${reorderMode ? `<div class="reorder-controls">
          <button class="move-btn" data-move="up" data-move-id="${q.id}" aria-label="Move ${escapeHtml(q.title)} up">↑</button>
          <button class="move-btn" data-move="down" data-move-id="${q.id}" aria-label="Move ${escapeHtml(q.title)} down">↓</button>
        </div>` : `<div class="quest-actions">
          <span class="xp-chip">+${d.xp} XP</span>
          <button class="mini-btn" data-edit="${q.id}">Edit</button>
          <button class="mini-btn" data-toggle="${q.id}">${q.active ? "Active" : "Paused"}</button>
          <button class="mini-btn" data-delete="${q.id}">✕</button>
        </div>`}
  </article>`;
}

function weekdayText(days) {
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return days.map(d=>names[d]).join(", ");
}

function renderQuestLibrary() {
  const qs = state.quests.filter(q => questFilter === "all" || q.type === questFilter);
  $("#questLibrary").innerHTML = qs.length ? qs.map(q=>questCard(q,false)).join("") :
    `<div class="empty-state">Nothing here yet.</div>`;
  $("#reorderBtn").classList.toggle("active", reorderMode);
  $("#reorderBtn").textContent = reorderMode ? "✓ Done ordering" : "↕ Reorder";
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
    html += `<button class="calendar-day ${cls}${key===selectedHistoryDate?" selected":""}${key===localDateKey()?" today":""}" data-history-date="${key}" ${disabled?"disabled":""} title="${key}: ${score}/100"><span>${day}</span>${hasActivity?`<i>${completedXpForDate(date)} XP</i>`:""}</button>`;
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
  const extras = state.quests.filter(q => completedIds.includes(q.id) && !planned.some(p=>p.id===q.id));
  return [...planned, ...extras];
}

function renderDayReview() {
  const date = parseLocalDate(selectedHistoryDate || localDateKey());
  const start = parseLocalDate(state.startedOn);
  const day = daysBetween(date,start) + 1;
  const quests = questsForReview(date);
  const completed = quests.filter(q=>isCompleted(q.id,selectedHistoryDate));
  const todayKey = localDateKey();
  $("#reviewDayLabel").textContent = day >= 1 ? `JOURNEY DAY ${day}` : "BEFORE THIS JOURNEY";
  $("#reviewDateLabel").textContent = selectedHistoryDate === todayKey ? "Today" : new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(date);
  $("#reviewScore").textContent = dailyScoreFor(date);
  $("#reviewXp").textContent = completed.reduce((sum,q)=>sum+xpForQuest(q),0);
  $("#reviewClears").textContent = `${completed.length}/${quests.length}`;
  $("#reviewQuestList").innerHTML = quests.length ? quests.map(q=>{
    const done = isCompleted(q.id,selectedHistoryDate);
    return `<div class="review-quest ${done ? "done" : "missed"}">
      <span class="review-check">${done ? "✓" : "○"}</span>
      <div><strong>${escapeHtml(q.title)}</strong><small>${done ? completionTimeLabel(q.id,selectedHistoryDate) : "Not completed"}</small></div>
      <span class="review-xp">${done ? `+${xpForQuest(q)} XP` : "—"}</span>
    </div>`;
  }).join("") : `<div class="empty-state compact">No quests were scheduled for this day.</div>`;

  $("#previousDayBtn").disabled = date <= start;
  $("#nextDayBtn").disabled = date >= parseLocalDate(localDateKey());
}

function moveQuest(id, direction) {
  const index = state.quests.findIndex(q=>q.id===id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= state.quests.length) return;
  [state.quests[index], state.quests[target]] = [state.quests[target], state.quests[index]];
  save();
  renderAll();
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
  $("#completedQuestStat").textContent = Object.values(state.completions).reduce((s,d)=>s+Object.values(d).filter(Boolean).length,0);
  let strong=0;
  const elapsedDays = journeyDay();
  for(let i=0;i<elapsedDays;i++){
    const d=addDays(parseLocalDate(state.startedOn),i);
    if(dailyScoreFor(d)>=80) strong++;
  }
  $("#strongDayStat").textContent = strong;
}

function toggleComplete(id, button) {
  const key = localDateKey();
  const q = state.quests.find(x=>x.id===id);
  if (!q) return;
  state.completions[key] ||= {};
  const wasDone = !!state.completions[key][id];
  const oldLevel = levelFromXp(totalXp());

  if (wasDone) delete state.completions[key][id];
  else state.completions[key][id] = new Date().toISOString();

  save();
  const newLevel = levelFromXp(totalXp());

  if (!wasDone) {
    xpPop(button, xpForQuest(q));
    if (navigator.vibrate) navigator.vibrate([18,30,18]);
    if (newLevel > oldLevel) showLevelUp(newLevel);
    else showToast(`Quest cleared · +${xpForQuest(q)} XP`);
  } else {
    showToast("Quest reopened");
  }
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
      ${d.icon} ${d.label}<br><small>${d.xp} XP</small>
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
  else state.quests.push({id:uid(),...questData,active:true});
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
  else state.categories.push({id:categoryUid(),...data});
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
    $$(".nav-btn").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    $$(".view").forEach(v=>v.classList.remove("active"));
    $(`#view-${btn.dataset.view}`).classList.add("active");
    window.scrollTo({top:0,behavior:"smooth"});
  }));

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
    const c=e.target.closest("[data-complete]");
    if(c) toggleComplete(c.dataset.complete,c);
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
      if(q && confirm(`Delete "${q.title}"? Existing completion history for it will no longer add XP.`)){
        state.quests=state.quests.filter(x=>x.id!==q.id); save(); renderAll();
      }
    }
    const move=e.target.closest("[data-move-id]");
    if(move) moveQuest(move.dataset.moveId, move.dataset.move);
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
  });

  $("#previousDayBtn").addEventListener("click",()=>stepHistoryDay(-1));
  $("#nextDayBtn").addEventListener("click",()=>stepHistoryDay(1));
  $("#previousMonthBtn").addEventListener("click",()=>shiftHistoryMonth(-1));
  $("#nextMonthBtn").addEventListener("click",()=>shiftHistoryMonth(1));

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

  $("#menuBtn").addEventListener("click",()=>$("#settingsDialog").showModal());
  $("#profileGreetingBtn").addEventListener("click",()=>$("#settingsDialog").showModal());
  $("#closeSettings").addEventListener("click",()=>{
    $("#settingsDialog").close();
    requestNameIfNeeded();
  });
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
      state=incoming; selectedHistoryDate=localDateKey(); historyMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1); migrateState(); save(); $("#settingsDialog").close(); renderAll(); showToast("Backup restored");
    }catch{ alert("That file does not look like a valid Level 90 backup."); }
    e.target.value="";
  });

  $("#startChallengeBtn").addEventListener("click",()=>{
    if(confirm("Start a fresh journey today? Your quest definitions are kept, but XP and completion history are cleared.")){
      state.startedOn=localDateKey(); state.completions={}; selectedHistoryDate=localDateKey(); historyMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1); save(); renderAll(); $("#settingsDialog").close(); showToast("Fresh journey started");
    }
  });

  $("#resetBtn").addEventListener("click",()=>{
    if(confirm("Reset everything to the original Level 90 starter data?")){
      state=freshState(); selectedHistoryDate=localDateKey(); historyMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1); save(); document.body.classList.remove("light"); $("#settingsDialog").close(); renderAll(); showToast("App reset");
    }
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }
}
bootstrap();
