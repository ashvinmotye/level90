"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"styles.css"),"utf8");
const app = fs.readFileSync(path.join(root,"app.js"),"utf8");
const notifications = fs.readFileSync(path.join(root,"notifications.js"),"utf8");
const serviceWorker = fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const backlog = fs.readFileSync(path.join(root,"docs","microinteraction-backlog.md"),"utf8");

assert.match(html,/id="toast"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html,/id="toastAction"[^>]*hidden/);
assert.match(html,/id="interactionAnnouncer"[^>]*role="status"/);
assert.match(html,/id="view-today"[^>]*tabindex="-1"/);
assert.match(html,/data-view="today" aria-current="page"/);
assert.match(html,/styles\.css\?v=50/);
assert.match(html,/id="confirmationDialog"[^>]*aria-labelledby="confirmationTitle"/);
assert.match(html,/id="appearanceOrbPreview"[^>]*aria-live="polite"/);
assert.match(html,/id="dailyClearMoment"/);

assert.match(app,/function captureTodayCardRects\(\)/);
assert.match(app,/function animateTodayCardLayout\(/);
assert.match(app,/quest-clear-confirm/);
assert.match(app,/actionLabel:"Undo"/);
assert.match(app,/function restoreCompletionSnapshot\(/);
assert.match(app,/function prefersReducedMotion\(\)/);
assert.match(app,/if \(prefersReducedMotion\(\) \|\| !anchor\) return/);
assert.match(app,/button\.setAttribute\("aria-current","page"\)/);
assert.match(app,/announceInteraction\([^\n]+Position/);
assert.match(app,/function captureQuestLibraryCardRects\(\)/);
assert.match(app,/function animateQuestLibraryLayout\(/);
assert.match(app,/interactionHaptic\(\[10,28,14\]\)/);
assert.match(app,/function showAuraConfirmation\(/);
assert.match(app,/async function collapseRemovedCard\(/);
assert.match(app,/function setMetricValue\(/);
assert.match(app,/const viewScrollPositions = new Map\(\)/);
assert.match(app,/view-enter-forward/);
assert.match(app,/function scheduleStoicWeekSave\(/);
assert.match(app,/setStoicSaveState\("saving"\)/);
assert.match(app,/const FINAL_CLEAR_MOMENT_KEY/);
assert.match(app,/function claimDailyClearMoment\(/);
assert.match(app,/function showDailyClearMoment\(/);
assert.match(app,/function revealSavedQuest\(/);
assert.doesNotMatch(app,/\bconfirm\s*\(/);
assert.doesNotMatch(app,/Stoic reflection saved/);

assert.match(notifications,/showToast\("Notification cleared\.",\{[\s\S]*?actionLabel:"Undo"/);
assert.match(notifications,/showToast\("All notifications cleared\.",\{[\s\S]*?actionLabel:"Undo"/);
assert.match(notifications,/async function level90AnimateNotificationCardsOut\(/);
assert.match(notifications,/notification-inbox-empty\$\{revealEmpty/);
assert.match(notifications,/badge\.classList\.remove\?\.\("is-counting"\)/);

assert.match(css,/\.tile-decrement-action,\.tile-repeat-action \{[\s\S]*?width:44px; height:44px/);
assert.match(css,/\.tile-decrement-action span \{[^}]*width:13px; height:2px/);
assert.match(css,/\.notification-clear-btn \{[\s\S]*?min-width:72px; min-height:44px/);
assert.match(css,/@media \(max-width: 520px\)[\s\S]*\.stoic-year-week-grid \{ grid-template-columns:repeat\(7/);
assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\*,\*::before,\*::after/);
assert.match(css,/\.quest-list \.quest-card\.dragging\.drop-marker::before/);
assert.match(css,/\.confirmation-dialog/);
assert.match(css,/\.stoic-save-state\[data-state="saving"\]/);
assert.match(css,/\.appearance-orb-preview/);
assert.match(css,/\.daily-clear-moment\.show/);
assert.match(css,/\.quest-card\.quest-saved-highlight/);
assert.match(css,/\.toast \{[\s\S]*?min-height:38px/);
assert.match(css,/\.toast-action \{[^}]*min-height:32px/);
assert.match(css,/\.toast-action::after \{[^}]*inset:-6px/);
assert.match(serviceWorker,/level90-v50/);
assert.match(backlog,/## Delivered in Version 45 — P1/);
assert.match(backlog,/## Delivered in Version 46 — P2/);

console.log("Level90 P0–P2 micro-interaction tests passed");
