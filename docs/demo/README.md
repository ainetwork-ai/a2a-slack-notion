# Demo

Video: https://youtu.be/cjSheRU3yws

## Files

- `demo.mp4` — final walkthrough with burned-in narration
- `narration.srt` — per-scene captions (matches actual scene durations)
- `record-scene.mjs` — Playwright recorder for a single named scene
  - Usage: `node record-scene.mjs <key>` where `<key>` is one of
    `newsroom · workflow · invite · tee_intro · tee_answer · canvas`
  - Output: `scenes/<key>.webm`
- `record.mjs` — legacy all-in-one recorder (kept for reference)
- `scenes/*.webm` — per-scene recordings, source of truth
- `concat.txt` — ffmpeg concat list

## Rebuild

```bash
# 1. Record (or re-record) individual scenes
node record-scene.mjs workflow
node record-scene.mjs canvas
# …

# 2. Stitch + burn captions
ffmpeg -y -f concat -safe 0 -i concat.txt \
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p \
  -vf "subtitles=narration.srt:force_style='FontName=Inter,FontSize=18,BorderStyle=3,Outline=2,BackColour=&H80000000&,Alignment=2,MarginV=40'" \
  -movflags +faststart demo.mp4
```

Scenes can be recorded in parallel — each one runs its own Playwright
context, so failures are isolated and any single scene can be re-recorded
without touching the others.
