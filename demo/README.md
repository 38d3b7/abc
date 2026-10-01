# Demo recording

`<3 min` walkthrough of the live console against Arc testnet.

```bash
# console on :5174 and executor on :8787
cd demo && npm i && npm run record
# writes abc-demo.webm; convert:
ffmpeg -y -i abc-demo.webm -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart abc-demo.mp4
```

The cut (≈90s) is: Overview → Token list → WLK3 success (fee ledger, lock bar, treasury) → Activity (expanded intent timeline) → Automations → Settings → Blockscout hook page.
