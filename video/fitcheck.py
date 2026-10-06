#!/usr/bin/env python3
"""Report narration clips that overrun the timeline or collide with the next clip."""
import json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent
VO = ROOT / "work" / "vo-kokoro"
t = json.loads((ROOT / "timeline.json").read_text())
def dur(p): return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(p)],capture_output=True,text=True).stdout or 0)
starts, cur = [], 0.0
for s in t: starts.append(cur); cur += s["dur"]
total = cur
events = []
for i, s in enumerate(t):
    for v in s.get("vo", []):
        d = dur(VO / f"{v['clip']}.wav")
        events.append((starts[i] + v.get("at", 0), d, v["clip"], i))
events.sort()
ok = True
for j, (st, d, clip, i) in enumerate(events):
    end = st + d
    nxt = events[j + 1][0] if j + 1 < len(events) else total
    flag = "" if end + 0.25 <= nxt else f"  <-- overlaps next by {end + 0.25 - nxt:.2f}s"
    ok &= not flag
    print(f"seg {i:02d} {clip:12} {st:6.1f} → {end:6.1f}s ({d:4.1f}s)  next {nxt:6.1f}{flag}")
print(f"total {total:.1f}s; {'all clear' if ok else 'FIX NEEDED'}")
