# Changelog

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
