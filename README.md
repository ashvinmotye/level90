# Level 90 PWA

A local-first gamified 90-day personal improvement app.

## Included
- Preloaded categories and starter quests from `data/initial-data.json`
- Difficulty-only XP assignment (users cannot enter arbitrary XP)
- Recurring daily or selected-weekday quests
- One-off quests
- XP, levels and category levels
- Daily score based on completed vs planned XP
- 7-day momentum score
- 90-day journey grid
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
