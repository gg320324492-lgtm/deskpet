# Audio assets

`SoundManager` includes lightweight Web Audio effects, so the app has usable
feedback without shipping external audio files. Files in this directory are
optional overrides: when one loads successfully it is preferred over the
matching generated effect.

- `footstep.mp3` — walking, running and landing
- `pop.mp3` — short interaction reaction
- `chime.mp3` — completion and achievement
- `yawn.mp3` — yawn and stretch
- `water.mp3` — drink and water reminder
- `pomodoro-start.mp3` — focus session begins
- `pomodoro-end.mp3` — focus or rest phase ends
- `happy.mp3` — celebration

Missing or unsupported files are handled silently. Volume, mute and DND apply
equally to external clips and generated effects.
