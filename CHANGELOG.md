# Changelog

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
