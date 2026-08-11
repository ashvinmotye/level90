
const STORAGE_KEY = "level90-state-v1";
let CONFIG = null;
let state = null;
let questFilter = "all";

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

async function bootstrap() {
  CONFIG = await fetch("./data/initial-data.json").then(r => r.json());
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { state = JSON.parse(saved); } catch {}
  }
  if (!state) state = freshState();
  migrateState();
  bindEvents();
  renderAll();
  registerSW();
}
function freshState() {
  return {
    startedOn: localDateKey(),
    quests: structuredClone(CONFIG.quests),
    categories: structuredClone(CONFIG.categories),
    completions: {},
    theme: "dark"
  };
}
function migrateState() {
  state.quests ||= structuredClone(CONFIG.quests);
  state.categories ||= structuredClone(CONFIG.categories);
  state.completions ||= {};
  state.startedOn ||= localDateKey();
  state.theme ||= "dark";
  document.body.classList.toggle("light", state.theme === "light");
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

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
function levelFromXp(xp) {
  let lvl = 1;
  while (xpRequiredForLevel(lvl + 1) <= xp && lvl < 99) lvl++;
  return lvl;
}
function levelProgress(xp) {
  const lvl = levelFromXp(xp);
  const start = xpRequiredForLevel(lvl);
  const end = xpRequiredForLevel(lvl+1);
  return {
    lvl, start, end,
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

function challengeDay(date=new Date()) {
  return Math.max(1, Math.min(CONFIG.app.challengeDays, daysBetween(date, parseLocalDate(state.startedOn)) + 1));
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
  renderJourney();
  renderCharacter();
  renderDifficulty();
}
function renderHeader() {
  const xp = totalXp();
  const p = levelProgress(xp);
  $("#levelNumber").textContent = p.lvl;
  $("#characterLevelTitle").textContent = `Level ${p.lvl}`;
  $("#xpText").textContent = `${xp - p.start} / ${p.end - p.start} XP`;
  $("#nextLevelText").textContent = `${p.end - xp} to next level`;
  $("#xpBar").style.width = `${p.pct}%`;
  $("#dayTitle").textContent = `Day ${challengeDay()} / ${CONFIG.app.challengeDays}`;
  $("#dateLabel").textContent = new Intl.DateTimeFormat(undefined,{weekday:"long",month:"short",day:"numeric"}).format(new Date());
  $("#themeBtn").textContent = state.theme === "dark" ? "☀" : "☾";
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
  renderCategoryStats();
}

function questCard(q, todayMode=false, dateKey=localDateKey()) {
  const cat = category(q.categoryId);
  const d = difficulty(q.difficulty);
  const done = isCompleted(q.id,dateKey);
  const repeat = q.type === "oneoff" ? "One-off mission" :
    q.schedule?.mode === "daily" ? "Every day" :
    `Repeats ${weekdayText(q.schedule?.days || [])}`;
  return `
  <article class="quest-card ${done ? "completed" : ""}" data-id="${q.id}">
    <div class="quest-icon">${cat.icon}</div>
    <div>
      <div class="quest-title">${escapeHtml(q.title)}</div>
      <div class="quest-meta">
        <span>${cat.name}</span><span>•</span><span>${d.icon} ${d.label}</span><span>•</span><span>${repeat}</span>
      </div>
    </div>
    ${todayMode ? `
      <div class="quest-actions">
        <span class="xp-chip">+${d.xp} XP</span>
        <button class="complete-btn ${done ? "done":""}" data-complete="${q.id}" aria-label="Toggle completion">${done ? "✓" : "○"}</button>
      </div>`
      : `<div class="quest-actions">
          <span class="xp-chip">+${d.xp} XP</span>
          <button class="mini-btn" data-toggle="${q.id}">${q.active ? "Active" : "Paused"}</button>
          <button class="mini-btn" data-delete="${q.id}">✕</button>
        </div>`}
  </article>`;
}

function weekdayText(days) {
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return days.map(d=>names[d]).join(", ");
}

function renderCategoryStats() {
  const el = $("#categoryStats");
  el.innerHTML = state.categories.map(c => {
    const xp = categoryXp(c.id), p = levelProgress(xp);
    return `<div class="stat-card">
      <div class="stat-head"><strong>${c.icon} ${c.name}</strong><span class="stat-level">LVL ${p.lvl}</span></div>
      <div class="stat-xp">${xp} XP invested</div>
    </div>`;
  }).join("");
}

function renderQuestLibrary() {
  const qs = state.quests.filter(q => questFilter === "all" || q.type === questFilter);
  $("#questLibrary").innerHTML = qs.length ? qs.map(q=>questCard(q,false)).join("") :
    `<div class="empty-state">Nothing here yet.</div>`;
}

function renderJourney() {
  const start = parseLocalDate(state.startedOn);
  const currentDay = challengeDay();
  let html = "";
  for (let i=1; i<=CONFIG.app.challengeDays; i++) {
    const d = addDays(start, i-1);
    const score = dailyScoreFor(d);
    let cls = "";
    if (i < currentDay || (i === currentDay && completedXpForDate(d)>0)) {
      if (score >= 80) cls = "done";
      else if (score > 0) cls = "partial";
    }
    if (i === currentDay) cls += " today";
    if ([10,30,60,90].includes(i)) cls += " boss";
    html += `<div class="day-node ${cls}" title="Day ${i}: ${score}/100">${i}</div>`;
  }
  $("#journeyGrid").innerHTML = html;
}

function renderCharacter() {
  $("#characterStats").innerHTML = state.categories.map(c => {
    const xp = categoryXp(c.id), p = levelProgress(xp);
    return `<div class="character-row">
      <div class="character-top">
        <strong>${c.icon} ${c.name}</strong><span>LEVEL ${p.lvl} · ${xp} XP</span>
      </div>
      <div class="character-progress"><i style="width:${p.pct}%"></i></div>
    </div>`;
  }).join("");
  $("#totalXpStat").textContent = totalXp();
  $("#completedQuestStat").textContent = Object.values(state.completions).reduce((s,d)=>s+Object.values(d).filter(Boolean).length,0);
  let strong=0;
  for(let i=0;i<CONFIG.app.challengeDays;i++){
    const d=addDays(parseLocalDate(state.startedOn),i);
    if(d > new Date()) break;
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
  else state.completions[key][id] = true;

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
  const el = document.createElement("div");
  el.className = "xp-pop";
  el.textContent = `+${xp} XP`;
  el.style.left = `${Math.max(12, r.left - 10)}px`;
  el.style.top = `${r.top}px`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),950);
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

function openQuestDialog() {
  $("#questForm").reset();
  $("#questCategory").innerHTML = state.categories.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  $("#questDialog").dataset.type="recurring";
  $("#questDialog").dataset.schedule="daily";
  $("#questDialog").dataset.difficulty="medium";
  $$(".segment[data-type]").forEach(b=>b.classList.toggle("active",b.dataset.type==="recurring"));
  $$(".segment[data-schedule]").forEach(b=>b.classList.toggle("active",b.dataset.schedule==="daily"));
  $$("#weekdayPicker button").forEach(b=>b.classList.remove("selected"));
  $("#scheduleFields").classList.remove("hidden");
  $("#weekdayPicker").classList.add("hidden");
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

function createQuest(e) {
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
  state.quests.unshift({
    id:uid(),
    title,
    categoryId:$("#questCategory").value,
    difficulty:$("#questDialog").dataset.difficulty || "medium",
    type,
    schedule: mode==="weekdays" ? {mode,days} : {mode},
    active:true
  });
  save();
  $("#questDialog").close();
  renderAll();
  showToast("Quest added to your log");
}

function bindEvents() {
  $$(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
    $$(".nav-btn").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    $$(".view").forEach(v=>v.classList.remove("active"));
    $(`#view-${btn.dataset.view}`).classList.add("active");
    window.scrollTo({top:0,behavior:"smooth"});
  }));

  $("#quickAddBtn").addEventListener("click",openQuestDialog);
  $("#addQuestBtn").addEventListener("click",openQuestDialog);
  $("#closeQuestDialog").addEventListener("click",()=>$("#questDialog").close());
  $("#questForm").addEventListener("submit",createQuest);

  $("#difficultyPicker").addEventListener("click",e=>{
    const b=e.target.closest("[data-difficulty]"); if(!b)return;
    $("#questDialog").dataset.difficulty=b.dataset.difficulty; renderDifficulty();
  });

  $$(".segment[data-type]").forEach(b=>b.addEventListener("click",()=>{
    $$(".segment[data-type]").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("#questDialog").dataset.type=b.dataset.type;
    $("#scheduleFields").classList.toggle("hidden",b.dataset.type==="oneoff");
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
    const d=e.target.closest("[data-delete]");
    if(d){
      const q=state.quests.find(x=>x.id===d.dataset.delete);
      if(q && confirm(`Delete "${q.title}"? Existing completion history for it will no longer add XP.`)){
        state.quests=state.quests.filter(x=>x.id!==q.id); save(); renderAll();
      }
    }
  });

  $$(".filter-chip").forEach(b=>b.addEventListener("click",()=>{
    questFilter=b.dataset.filter;
    $$(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));
    renderQuestLibrary();
  }));

  $("#themeBtn").addEventListener("click",()=>{
    state.theme = state.theme==="dark" ? "light":"dark";
    document.body.classList.toggle("light",state.theme==="light");
    save(); renderHeader();
  });

  $("#menuBtn").addEventListener("click",()=>$("#settingsDialog").showModal());
  $("#closeSettings").addEventListener("click",()=>$("#settingsDialog").close());

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
      state=incoming; migrateState(); save(); renderAll(); $("#settingsDialog").close(); showToast("Backup restored");
    }catch{ alert("That file does not look like a valid Level 90 backup."); }
    e.target.value="";
  });

  $("#startChallengeBtn").addEventListener("click",()=>{
    if(confirm("Restart the 90-day timeline from today? Quest definitions are kept, completion history is cleared.")){
      state.startedOn=localDateKey(); state.completions={}; save(); renderAll(); $("#settingsDialog").close(); showToast("New 90-day run started");
    }
  });

  $("#resetBtn").addEventListener("click",()=>{
    if(confirm("Reset everything to the original Level 90 starter data?")){
      state=freshState(); save(); document.body.classList.remove("light"); renderAll(); $("#settingsDialog").close(); showToast("App reset");
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }
}
bootstrap();
