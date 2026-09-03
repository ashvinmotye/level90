# Level90 micro-interaction backlog

The interaction principle is simple: every action should show what changed, where it went and how to recover it. Motion should explain state rather than decorate every control.

## Delivered in Version 44 — P0

- P0 quest-completion choreography and spatial continuity
- P0 44px mobile touch targets
- P0 reversible quest and notification clearing
- P0 route, toast, selection and drag accessibility feedback
- P0 comprehensive reduced-motion behavior

## Delivered in Version 45 — P1

1. Animate surrounding quest cards and show an insertion marker during drag sorting; add restrained pickup, crossing and drop haptics.
2. Replace browser deletion confirmations with AuraOS confirmation sheets and collapse removed cards smoothly.
3. Animate only the score, XP, momentum or completion value that changed.
4. Preserve each primary tab's scroll position and use directional transitions for tabs and Back navigation.
5. Replace repeated Stoic save toasts with an inline Saving / Saved state and immediately mark reflected weeks.

## Delivered in Version 46 — P2

1. Play a restrained once-per-day completion moment after the final planned quest.
2. Add a compact live orb preview to Appearance for palette and level-font changes.
3. Slide cleared inbox items away, animate badge changes and reveal the empty state gracefully.
4. Highlight and scroll to newly created or edited quests.

## Guardrails

- Do not add more continuous ambient motion.
- Do not use heavy confetti for ordinary quest clears.
- Do not use haptics for navigation, appearance changes or routine selections.
- Do not add ripples to every control.
- Keep interaction feedback fast and never delay routine logging.
