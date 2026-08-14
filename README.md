# Level 90 PWA

A local-first personal progression game. There is no deadline: complete real-life quests, earn XP and keep climbing toward the ultimate Level 90 rank.

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
