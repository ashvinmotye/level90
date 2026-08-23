# Level 90 PWA

A local-first personal progression game. There is no deadline: complete real-life quests, earn XP and keep climbing toward the ultimate Level 90 rank.

## Version 20 mobile polish
- Centers toast messages and gives them a slimmer, more compact shape on phones and desktop.
- Prevents quiet-hour time inputs from overlapping by giving each one a safe full-width row on small screens.

## Version 19 smart streak rescue
- Adds Level90's first transparent contextual reminder rule without AI or fixed daily alarm times.
- Protects an unfinished scheduled recurring quest only when its active streak meets the chosen threshold.
- Learns the quest's usual completion time from up to 12 recent clears, waits another hour, and uses 18:00 only as a temporary fallback while fewer than three samples exist.
- Prioritizes the longest at-risk streak, then respects the custom quest order when streaks tie.
- Adds user-controlled quiet hours, streak threshold and daily reminder limit, plus a fixed four-hour cooldown.
- Adds one-reminder-per-quest-per-day deduplication, a logical notification outbox, per-device delivery logging and safe retry attempts.
- Runs the deterministic rules every 15 minutes through Supabase Cron while keeping the PWA fully local-first.
- Shows whether the scheduler is active, what the last rule check decided and the three most recent smart reminders in Settings.

### Phase 2 Supabase setup

1. Run `supabase/migrations/20260823_add_level90_smart_notifications.sql` once in the Supabase SQL Editor.
2. Generate a separate scheduler secret: `openssl rand -hex 32`.
3. In **Edge Functions → Secrets**, add it as `LEVEL90_DISPATCH_SECRET`. Keep this value private and separate from the VAPID keys.
4. Replace the deployed `level90-notifications` function with the included updated `supabase/functions/level90-notifications/index.ts` and deploy the update.
5. Open `supabase/cron/schedule_level90_smart_notifications.sql`, replace only `YOUR_RANDOM_LEVEL90_DISPATCH_SECRET` with the same scheduler secret, then run it once in the SQL Editor. It securely stores the project URL, publishable key and dispatch secret in Supabase Vault and creates the 15-minute Cron job.
6. Deploy the updated PWA, open **Settings → Notifications**, enable **Smart reminders**, review the defaults and save.

The first scheduler result should appear in Settings within 15 minutes. If no check arrives within roughly 35 minutes, inspect **Integrations → Cron → level90-smart-notifications** and the `level90-notifications` Edge Function logs. Smart reminders remain opt-in even after the migration and scheduler are installed.

## Version 18 notification foundation and Settings page
- Moves Settings out of the growing popup and into a dedicated, responsive app page.
- Adds a Phase 1 notification status panel with a user-triggered permission flow, editable device name, test notification and safe disconnect action.
- Stores each signed-in device's Web Push subscription in Supabase under Row Level Security.
- Adds an authenticated Supabase Edge Function that can send a fixed test notification only to one of the signed-in user's registered devices.
- Keeps smart reminders disabled for now. This phase proves that each device can receive Level90 pushes before reminder logic is introduced.

### Notification setup

1. Complete the existing sync setup below, then run `supabase/migrations/20260823_create_level90_notifications.sql` once in the Supabase SQL Editor.
2. Generate a VAPID key pair from a trusted local terminal: `npx web-push generate-vapid-keys`.
3. Add the keys and a contact subject to the function's Supabase secrets:
   `supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:you@example.com"`
4. Deploy the included function: `supabase functions deploy level90-notifications`.
5. Deploy every PWA file, sign in, then open **Settings → Notifications · Phase 1 → Enable notifications** and send a test.

Keep the VAPID private key only in Supabase secrets; never add it to the PWA. On iPhone or iPad, install Level90 to the Home Screen and open that installed app before enabling notifications. The panel explains when setup, sign-in, connectivity, permission or installation is still required.

## Version 17 device-source safety
- Adds an explicit **Use cloud data** choice for secondary devices such as a laptop.
- Replaces that device's local quests, custom order, completions and settings with the main device's cloud journey.
- Downloads and stores a recovery backup before replacing local data.
- Holds all queued edits on an unresolved device so **Sync now** cannot accidentally push its quest order to the main phone.
- Keeps **Upload this device** as the deliberate choice for the authoritative device.
- Shows whether a cloud journey was found before enabling the cloud-data choice.

## Version 16 Supabase sync
- Uses the same Supabase project and email/password account as Workout.
- Keeps Level90 local-first, including offline completions and edits that queue for automatic retry.
- Synchronizes profile settings, categories, quest definitions, custom quest order, completions and completion snapshots.
- Rebuilds XP and streaks consistently from synchronized completion history.
- Protects the first cloud pull from clearing or overwriting existing browser data.
- Offers a one-time **Upload existing data** action for an established local journey.
- Uses client timestamps and conflict-safe database triggers so an older delayed update cannot replace a newer edit.
- Propagates quest, category and completion deletion through soft-delete records while preserving historical completion XP.
- Shows account, connection, pending-change and last-sync information in Settings.
- Refreshes automatically after edits, app focus, visibility changes and reconnection, with **Sync now** as a fallback.
- Bypasses the PWA cache for Supabase API reads so cloud pulls never use stale cached responses.

### Supabase setup

1. Open the SQL Editor in the same Supabase project used by Workout.
2. Run `supabase/migrations/20260822_create_level90_sync.sql` once.
3. Deploy every file in this ZIP to the Level90 site.
4. Sign in with the same account used by Workout.
5. On the device containing the current Level90 journey, open **Settings → Account & Cloud** and choose **Upload this device**.
6. After it reports a successful sync, sign in on the second device and choose **Use cloud data**. Its local journey and quest order will be replaced with the main device's cloud version.

The migration creates four Level90-only tables with per-user composite keys and Row Level Security. It does not modify Workout tables. Existing Level90 browser data remains stored under the same local-storage key and is migrated in place before cloud sync begins.

Run `node tests/state-and-sync.test.cjs` to check legacy-data migration, streak continuity, historical XP, queue compaction, quest-order sync, composite upserts, first-upload protection, secondary-device upload blocking, exact cloud replacement and cloud tombstones. Run `node tests/notifications.test.cjs` to check device support, permission, subscription registration, test-send, disconnect and smart-setting behavior. Run `node tests/smart-notifications.test.cjs` to check streak qualification, learned timing, the fallback window, quiet hours, completed-quest suppression, schedule matching and longest-streak priority.

## Version 15 streaks and Today flow
- Calculates current and best recurring-quest streaks from existing completion history.
- Shows a compact `🔥 7`-style current streak on recurring quest tiles.
- Separates Today into Available today and Completed today while preserving the custom quest order in both sections.
- Moves a cleared quest into Completed today and restores it to its configured position when reopened.
- Keeps one-off quests streak-free and leaves today's still-open recurring quest from breaking its streak prematurely.
- Adds a backward-compatible local schema migration while preserving existing quests, completion timestamps, XP, themes and settings.

## Version 14 glow refinement
- Restores the original slow breathing animation on the Level number.
- Gives the internal glow genuinely randomized destinations and timing instead of a repeating geometric route.
- Replaces the visible white glow spot with two broad, low-opacity theme-color mists.
- Stops both breathing and glow movement when reduced motion is enabled.

## Version 13 orb refinement
- Removes the rank subtitle from inside the Level orb so the number becomes the single focal point.
- Moves a concentrated highlight around inside the Level number while retaining its slow breathing glow.
- Adds safe text spacing around the number so its gradient and glow are no longer clipped.

## Version 12 visual refinement
- Centers and enlarges the completed quest checkmark for a clearer success state.
- Removes the Level orb's inner background and inset shading so the animated halos can breathe.
- Gives the Level number a theme-aware dimensional gradient, layered glow and slow breathing emphasis.

## Version 11 improvements
- Asks for a display name in a dedicated first-launch popup instead of preloading Ashvin for every user.
- Makes all Data & Journey action labels the same size, including Import JSON backup.
- Removes level progress from the animated orb and moves it to a slim horizontal bar below the orb.
- Keeps “NEXT · LEVEL 2” and the exact stage XP counter aligned with the new progress bar.

## Version 10 refinement
- Removes the Level orb’s inner border, inner decorative ring and Home’s dotted level road for a cleaner composition. The detailed road remains in Character.
- Replaces “80 XP to level 2” with a compact “NEXT · LEVEL 2” target plus the existing stage XP counter.

## Version 9 experiment
- Reimagines the Level core as a living orb with three constantly rotating, stretching and morphing halos.
- Uses the active theme’s accent colors so every palette produces a different halo atmosphere.
- Keeps the XP progress ring functional and the center opaque for level-number readability.
- Stops halo motion when reduced motion is enabled at operating-system level.

## Version 8 improvements
- Keeps the central Level number fully legible by separating the opaque inner face from the outer XP progress ring.
- Removes quest icons and quest-icon controls for a cleaner quest experience.
- Shows four Today cards per row on desktop and three per row on mobile.
- Changes the greeting to the more thematic “Level up, Ashvin! 👋” format using the saved display name.

## Version 7 improvements
- Replaces the previous Theme Studio palettes with Arctic Depths, Jade Horizon, Aurora Blossom and Rosé Sunrise from the supplied references.
- Adds two ambient color glows that drift slowly across the background to create subtle depth.
- Honors reduced-motion preferences by pausing the ambient background animation.
- Enlarges quest illustrations, positions them partially outside the lower-left edge and moves XP to the lower-right.

## Version 6 improvements
- Turns the seven Home dots into a real nearby-level road; the central orb remains the current-level XP meter.
- Shows two quest cards per row on mobile and three per row on desktop.
- Adds safe category management: create, edit, choose an icon and delete only when no quests use the category.
- Adds searchable emoji pickers plus custom emoji input for categories and quests.
- Makes existing quests editable without losing their order or completion history.
- Removes category stats from Today while keeping the detailed Character sheet.

## Version 5 improvements
- Rebuilds Today from the supplied mockup: personal greeting, large central level core, one next-level target, segmented XP progress and a spacious two-column quest grid.
- Makes the entire quest tile a completion target and gives each quest a large contextual illustration.
- Animates earned XP from the completed quest into the central level core.
- Moves the detailed Level Road to Character so Today remains intentionally minimal.
- Adds an editable display name in Settings while preserving all Version 4 themes and functionality.

## Version 4 improvements
- Adds a Theme Studio in Settings with live, persistent palette switching.
- Includes Ember Ascension, Copper & Jade, Solar Forge, Neon Orchid, Crimson Alchemy and Sandstone Night.
- Every palette is fully integrated across backgrounds, cards, buttons, level effects, progress, completions, history and celebrations.
- Each palette supports both dark and light appearance modes.
- Existing saves automatically use Ember Ascension until another palette is selected.

## Version 3 improvements
- Removes the 90-day countdown. Journey days remain as neutral history only.
- Rebuilds Today around the current level, XP remaining, today's XP potential, next quest and estimated strong days to level up.
- Adds a nearby-level road with special milestone ranks at Levels 5, 10, 20, 30, 50, 75 and 90.
- Replaces the fixed 90-day map with an unlimited monthly activity calendar and detailed per-day history.
- Introduces a warmer coral, gold and mint ascension interface with animated level rings.
- Existing browser data and JSON backups remain compatible.

## Version 2 improvements
- Reorder every quest with mobile-friendly up/down controls. The chosen order is also used on Today.
- Select any challenge day from Daily History to see its score, XP, completed quests and completion times.
- A redesigned Today command card makes the current day, days remaining, level, next-level target and next quest much more prominent.
- Existing version 1 browser data and JSON backups remain compatible.

## Included
- Preloaded categories and starter quests from `data/initial-data.json`
- Difficulty-only XP assignment (users cannot enter arbitrary XP)
- Recurring daily or selected-weekday quests
- One-off quests
- XP, levels and category levels
- Daily score based on completed vs planned XP
- 7-day momentum score
- Unlimited monthly activity history
- Level road and milestone titles through Level 90
- Dark/light theme
- JSON backup and restore
- Offline PWA service worker
- Installable manifest
- Animated XP popups and level-up overlay

## Run locally
Service workers need HTTP/HTTPS rather than opening `index.html` directly.

Examples:
- Deploy the folder to GitHub Pages, or
- From this folder run: `python3 -m http.server 8080`
- Then visit: `http://localhost:8080`

## Customize starter content
Edit `data/initial-data.json`.

Difficulty XP values currently are:
- Tiny: 5
- Easy: 10
- Medium: 20
- Hard: 40
- Major: 75
- Epic: 100
