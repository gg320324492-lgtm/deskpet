# Changelog

## 1.3.9 - 2026-07-22

### Fixed

- The nickname entered during first-run onboarding is now saved correctly; it
  was previously lost every time because the input was read after removal.
- Resuming a paused Pomodoro no longer resets the remaining time back to the
  full session length, and pressing pause twice no longer raises an error.
- Mood bias, achievement de-duplication, remembered preferences (nickname and
  likes), and affinity tier unlocks now actually take effect in the running
  app; a snapshot-shape mismatch had silently disabled all of them.
- Tasks placed in the waiting lane are no longer pulled back into Today or
  Later by their due date; waiting now reliably wins until you bring them back.
- Pausing or resuming during a rest segment of Focus Flow is no longer
  miscounted as a completed focus and no longer pops the end-of-focus decision.
- Keyboard activity during the Focus Work scene now extends the idle window as
  designed; the extension path previously never fired.
- The local conversation fallback no longer shows an empty bubble when the
  backend returns a blank reply.
- Closing the context menu with ESC or a menu item no longer leaks a global
  mouse listener; popover timers and listeners are also cleaned up reliably,
  keeping long sessions light.
- Rapid-click reactions now match the documented thresholds: one click
  surprises, two cheer, three show love, four cheer again, and five or more
  show love.

### Improved

- Text cleanup for notes, tiny steps, reflections, and task fields now goes
  through one shared helper instead of nine near-identical copies.
- Quiet-hours checks in Do Not Disturb and scene scheduling now share a single
  time-window helper, so both always agree.
- The conversation history limit is now defined in one place and shared between
  the AI service and its policy, removing a duplicated magic number.
- Main-process request handlers are now individually guarded, and unexpected
  errors or rejected promises are caught process-wide instead of crashing
  silently.
- Task pickup ordering in gentle start, soft windows, and task resume now uses
  one shared comparator instead of three duplicated ones.
- Unused internal fields and dead code paths were removed, stale comments and
  file headers were corrected, and mouse hit-testing does about half as much
  DOM work per movement.
- The task editor dialog now announces itself correctly to assistive
  technology, and background task failures are logged instead of swallowed.
- Test runs no longer leave temporary storage directories behind, and the
  storage tests now assert that the `.bak` file always keeps the previous
  valid data — the backup behaviour itself was verified correct and unchanged.
- The README click-reaction table now documents the four-click and
  five-or-more-click reactions.

## 1.3.8 - 2026-07-19

### Added

- A task can keep one optional local “this is where I got to” sentence when it
  is completed or archived.
- Task editing now includes a compact thread view for its latest tiny steps,
  small notes, waiting reason, last starting point, and closing sentence.

### Improved

- Daily task review shows at most a few completed and waiting tasks as useful
  context for picking up later. It is not a reminder, score, ranking, or
  notification surface.
- All task-thread context stays in the existing local task record and remains
  reversible through the existing restore flows.

## 1.3.7 - 2026-07-19

### Added

- An unfinished task can be placed in a local, separate “waiting” lane with an
  optional one-line note about what it is waiting for.

### Improved

- Waiting quietly removes a task from Today’s suggestions and mainline without
  completing it or discarding its notes, tiny steps, saved return cue, or time
  block.
- A waiting task can be brought back to Today at any time. This adds no due
  date pressure, countdown, notification, or automatic focus.

## 1.3.6 - 2026-07-19

### Added

- A locally stored acknowledgement now distinguishes a fresh return cue from an
  older, already-picked-up starting point.

### Improved

- Picking up a cue keeps its words as “last starting point,” but removes only
  its suggestion priority. The current tiny action and ordinary mainline rules
  take over naturally.
- A new cue saved at the next quiet closeout becomes pending again. The task
  editor keeps either state visible and editable without adding reminders,
  notifications, or automatic focus.

## 1.3.5 - 2026-07-19

### Added

- A saved return cue can now be explicitly picked up from gentle start, the
  soft-window suggestion, or the Today mainline cue.
- The shared pickup entry lets you confirm or rewrite one tiny action for this
  pass before choosing the task as Today's mainline.

### Improved

- Picking up a task preserves its saved return cue and soft-window placement;
  it never starts focus, completes the parent task, or forces a tiny action.
- You can leave the cue alone, clear the resulting mainline, or choose another
  task at any time.

## 1.3.4 - 2026-07-19

### Added

- A quiet closeout can now keep one optional “start here next time” hint using
  the task's existing next-step fields.

### Improved

- A deliberately saved hint makes the task the first quiet candidate in gentle
  start and soft-window suggestions, and gives it a visible, unselected cue in
  the Today mainline picker.
- No hint triggers a notification, automatic focus, automatic mainline choice,
  or parent-task completion.

## 1.3.3 - 2026-07-19

### Added

- Added a compact quiet-closeout review for a finished micro-step set. It shows
  the one-to-three steps already walked and up to three recent local notes
  before the task is placed or explicitly completed.

### Improved

- The review is local and descriptive only: it adds no score, progress target,
  deadline pressure, or automatic parent-task completion.

## 1.3.2 - 2026-07-18

### Added

- Active focus now names the one unfinished micro step it is accompanying.
- At the end of a focus segment, that micro step can be put away together with
  one optional local note.

### Improved

- Putting away a final micro step still leaves the parent task open and routes
  it only to the existing quiet checkpoint; nothing is auto-completed.

## 1.3.1 - 2026-07-18

### Added

- Added optional local micro notes to the task closeout: write one short line
  about what that finished set moved forward, then choose the task's next place.
- A task stores only its latest three micro notes. Task cards show just the most
  recent one; the completion review shows the small set in full.

### Improved

- Restoring a completed task keeps its micro notes intact, while a repeating
  task starts its next recurrence with a fresh, empty local trace.

## 1.3.0 - 2026-07-18

### Added

- Added a quiet task closeout for a fully finished micro-step set. A task stays
  open until you explicitly choose to mark it complete.
- From the home page, choose to complete the task, begin a fresh one-step set,
  keep it today, leave it for the next soft window, or leave it for tomorrow.

### Improved

- Fully finished micro-step sets no longer return as the next gentle-start or
  soft-window suggestion. The task board labels them as quietly ready instead.
- Repeating tasks keep the familiar micro-step wording and reset it for their
  next recurrence after an explicit completion.

## 1.2.9 - 2026-07-18

### Added

- Added optional local micro steps: split a task into one to three tiny,
  executable actions from the task editor.
- The home page, soft-window suggestion, and Today mainline now show only the
  current unfinished micro step when a task has them.

### Improved

- A completed-focus landing can now mark just the current micro step done;
  the next one appears naturally without auto-completing the parent task.
- Moving a task between Today, later windows, and tomorrow keeps its unfinished
  micro steps together. Repeating tasks start their next recurrence fresh.

## 1.2.8 - 2026-07-18

### Added

- Added a quiet home-page soft-window card for morning, afternoon, and evening.
  It surfaces one suitable Today task when a window is active, without alerts.
- Near the end of a window, unfinished work can be manually left for the next
  window; evening handoffs safely become tomorrow morning.

### Improved

- The completed-focus next-step card now has a one-click handoff into the next
  soft window, preserving the task and its optional next-step note locally.
- Soft-window suggestions never start focus, show notifications, or impose a
  minute-level schedule.

## 1.2.7 - 2026-07-18

### Added

- Added a quiet home-page daily landing with descriptive counts for completed,
  in-progress, and later tasks—without a score or completion-rate pressure.
- Unfinished Today tasks can now stay today, move to tomorrow, or return to
  the inbox directly from the home page, without a popup.

### Improved

- A focus next step is shown while closing out a task and remains attached when
  it moves to tomorrow, where the gentle start naturally offers it again.
- The existing task-page closeout now uses the same three calm destinations.

## 1.2.6 - 2026-07-18

### Added

- Added an optional next-tiny-step field to the completed-focus landing card.
  Saving it keeps one executable starting point on the unfinished task.

### Improved

- The home-page gentle start now prioritizes a next step saved after focus,
  then the selected Today mainline. Completing a task still needs no summary
  and naturally flows into the existing daily review.

## 1.2.5 - 2026-07-18

### Added

- Added a calm home-page "one small step" card that offers one current task
  for a user-initiated focus start, preferring the chosen Today mainline.

### Improved

- Starting from the home page also saves that task as today's mainline. The
  card never auto-starts focus, and it switches to a simple status view while
  a focus period is already active.

## 1.2.4 - 2026-07-18

### Added

- Added a home-page view of in-focus captured thoughts: see the current
  "later" count and the most recently saved thought at a glance.
- Added one calm daily set of up to three captured thoughts, each of which can
  be moved to Today, kept for later, or archived without a deadline or popup.

### Improved

- The daily set is fixed after the first choice, so working through one item
  never immediately replaces it with another; untouched items simply wait.

## 1.2.3 - 2026-07-18

### Added

- Added an in-focus quick capture field that sends a thought straight to the
  local inbox without pausing or rescheduling the current focus period.
- Captured thoughts are marked "later" and the end-of-period companion card
  gently reports how many were set aside.

## 1.2.2 - 2026-07-18

### Added

- Added an optional one-line reflection for each completed focus period.
- Added a local Today-in-small-pieces view that groups completed focus periods
  under the current mainline when one is selected.

### Improved

- Focus reflections appear in the daily rhythm timeline without scores,
  streaks, or required end-of-day summaries.

## 1.2.1 - 2026-07-17

### Added

- Added a live Focus Companion card that mirrors the desktop pet's linked
  focus state, task, elapsed time, and gentle phase feedback in the room.
- Completing a linked focus period now offers three calm choices: continue a
  little longer, rest first, or explicitly mark the task complete.

### Improved

- Pausing and resuming linked focus now receive companion feedback without
  turning focus time into a streak or check-in system.

## 1.2.0 - 2026-07-17

### Added

- Added a local Today\'s Thread selector for choosing one open Today task as a
  gentle starting point.
- The selected task leads the Focus Flow queue and can be switched, cleared,
  or started directly without adding ranking pressure.

## 1.1.9 - 2026-07-17

### Added

- Added a Today-only completion review card with completion time and optional
  next-step note.
- Recently completed tasks can be safely restored to Today or the inbox.

## 1.1.8 - 2026-07-17

### Added

- Added a compact task editor for updating a title, optional next step, and
  task location without rebuilding the task.
- Notes are local-only, safely bounded, shown in task search, and preserved
  when recurring tasks are queued again.

## 1.1.7 - 2026-07-17

### Added

- Added local title search across inbox, Today, Later, and archived tasks.
- Search results can move a task to Today, restore an archived task, or start
  a Focus Flow session for a Today task.

## 1.1.6 - 2026-07-17

### Added

- Added a local task reset card for open inbox or Later tasks that have waited
  seven days or longer.
- Added reversible local task archiving: archive a task to hide it from daily
  lanes, then restore it to the inbox whenever it becomes relevant again.

## 1.1.5 - 2026-07-17

### Added

- Added Today Start, a compact opening card that surfaces only tasks explicitly
  carried from yesterday's local tomorrow plan.
- Added one-click handoff from a carried task to the next open soft time block,
  or directly into a linked Focus Flow session.

### Improved

- Starting or scheduling a carried task removes its tomorrow-only marker, so
  the planning state never lingers after the day has begun.
- The opening card intentionally ignores overdue and ordinary tasks to keep the
  first decision of the day calm and trustworthy.

## 1.1.4 - 2026-07-17

### Added

- Added Tomorrow Start: turn the existing “tomorrow's first task” reflection
  into a real local task with one click.
- Added a deliberately small tomorrow plan: one Most Important task and up to
  two Doable tasks, selected explicitly from the inbox.

### Improved

- Planned tomorrow tasks can be returned to the inbox at any time. Moving one
  forward into Today clears its tomorrow-only label automatically.
- Existing task priorities are not reinterpreted as a tomorrow plan; only
  explicitly planned tasks receive the new local marker.

## 1.1.3 - 2026-07-17

### Added

- Added a local Day Closeout card for unfinished Today tasks. Each task can be
  moved to tomorrow, returned to the inbox, or left for later without being
  deleted.
- Added a concise saved day-closeout summary that records completed and still
  unplaced tasks alongside the existing daily reflection.

### Improved

- Returning a task to tomorrow, inbox, or later clears its old soft time block
  so the day view stays truthful.
- Saving a handwritten daily reflection now preserves the automatically saved
  closeout summary, and vice versa.

## 1.1.2 - 2026-07-17

### Added

- Added optional soft time blocks for Today tasks: Morning, Afternoon, and
  Evening. They deliberately avoid minute-level scheduling and can be cleared
  at any time.
- Added a compact three-part day view in the character room, including a
  one-click action that places an unplanned task into the next open block.
- Added an on/off local time-block reminder. While the app is running, it can
  gently surface one matching task per block per day; it never creates network
  activity or operating-system notifications.

### Improved

- Moving a task back to Later also clears its soft time block, so the day view
  remains an honest reflection of today's intentions.

## 1.1.1 - 2026-07-17

### Added

- Added a local task inbox: quickly capture an item without assigning it to
  today, then move it to Today or Later only when ready.
- Added a three-lane task board in the character room, with direct completion,
  gentle rescheduling, and a focus queue driven only by Today tasks.
- Added one-click conversion from saved next-week light goals into inbox tasks.

### Improved

- Due dates now surface tasks automatically in Today or Later, while existing
  undated tasks safely migrate to the inbox.

## 1.1.0 - 2026-07-17

### Added

- Added a local weekly review to the character room, with real seven-day focus
  duration, active days, completed tasks, the strongest focus day, and a
  compact intensity ribbon.
- Added one to three optional “next week light goals”. They are saved only on
  the device and are included in normal backups.

### Improved

- The weekly note offers a gentle, deterministic encouragement based on the
  recorded rhythm, without sending activity data to any remote service.

## 1.0.9 - 2026-07-17

### Added

- Added a local Daily Rhythm ledger that records focus starts, completions,
  skips and stops, completed tasks, and deliberate scene changes. History is
  bounded and remains on the device.
- Added a seven-day focus ribbon, real elapsed focus duration, task completion
  rate, and a readable daily timeline to the character room.
- Added a lightweight daily reflection with a short note and tomorrow's first
  task. It is included in the normal local backup.

### Improved

- Focus durations now exclude paused time and use elapsed session time instead
  of estimating from the configured Pomodoro length.
- Completing an already-complete or missing task no longer emits a duplicate
  completion side effect.

## 1.0.8 - 2026-07-17

### Added

- Added the Focus Flow: Pomodoro work temporarily activates the Focus scene,
  breaks use Relaxed Companion, and completion or stopping returns to the
  user's previous manual or scheduled scene.
- Added task-linked focus from the room: choose a current task to start a
  session; a naturally completed work period marks that task complete before
  moving to rest. Skipping a phase never completes a task.
- Added pause/resume, skip, stop and room-entry controls to the system tray
  and pet context menu.
- Added a Focus Flow task queue and daily estimated focus minutes in the room.

## 1.0.7 - 2026-07-17

### Added

- Added runtime-only companion scenes: Free Companion, Focus Work, Relaxed
  Companion and Night Rest. Each scene temporarily adjusts activity and, where
  appropriate, Do Not Disturb without overwriting the user's saved preferences.
- Added scheduled scene switching with daytime and overnight time ranges.
- Added a responsive Scene Companion card in room settings, including live
  current-state feedback and one-click preset selection.
- Added a Quick Scenes submenu in the system tray for instant scene changes.

### Compatibility

- Existing settings receive safe scene defaults automatically and need no reset.

## 1.0.6 - 2026-07-17

### Added

- Added a Desktop Control card in room settings showing the companion's current
  monitor and position, with one-click actions to move it to the cursor screen
  or restore a safe default position.
- Multi-display startup can now be pinned to any currently recognised display,
  in addition to the primary-display and cursor-display choices.
- The Do Not Disturb card now explains whether manual or scheduled DND is active
  and shows the next scheduled start or end time.

### Improved

- Desktop control actions persist their resulting safe positions automatically.
- Settings are responsive across desktop and narrow layouts, with touch-friendly
  recovery buttons.

## 1.0.5 - 2026-07-17

### Added

- The companion now remembers its last desktop position and restores it after
  restarting.
- Scheduled Do Not Disturb now uses the configured start and end times, including
  schedules that cross midnight.

### Improved

- The primary-display and cursor-display startup targets now select the intended
  monitor on multi-display desktops.
- Saved positions are clamped to the selected monitor's work area, and the
  companion is recovered automatically after a monitor is removed or resized.
- Manual and scheduled Do Not Disturb states are independent, so schedule changes
  never overwrite the manual preference.
- Start and end time controls are now visible in the room settings page.

### Compatibility

- Existing settings are migrated automatically; no manual reset is required.
- Saved data and custom outfits from 1.0.4 remain compatible.

## 1.0.4 - 2026-07-16

### Added

- Completed independent transparent sprites for all 18 companion states.
- Added a bundled lavender sleepwear outfit covering all 18 states.
- Added procedural Web Audio feedback for movement, interactions, reminders,
  achievements and Pomodoro transitions, with optional external file overrides.

### Improved

- Outfit switching now reloads sprites immediately and falls back per state for
  incomplete custom packs.
- The character room reports complete `18/18` sleepwear coverage on desktop and
  narrow layouts.
- Asset preprocessing can build a full outfit or selected outfit states.
- Automated checks now cover the complete sprite catalog, wardrobe assets and
  procedural sound behavior.

### Compatibility

- Existing settings and companion data remain compatible with 1.0.3.
- This build does not require a data migration or manual asset preprocessing.
