# Audio assets

SoundManager (src/renderer/sound.js) plays short sound effects here.

Required filenames (placeholders may be added later):

- footstep.mp3          — soft step (walk)
- pop.mp3               — bubble pop (LOVE, CHEER reactions)
- chime.mp3             — completion / todo done
- yawn.mp3              — yawn state
- water.mp3             — water reminder
- pomodoro-start.mp3    — pomodoro begin
- pomodoro-end.mp3      — pomodoro phase end
- happy.mp3             — celebrations

If a file is missing, SoundManager silently no-ops; the UI never errors.
