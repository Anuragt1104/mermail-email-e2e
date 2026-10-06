#!/usr/bin/env python3
"""Assemble the mermail-email-e2e demo video from title cards, VHS terminal takes, overlays, and narration.

Every segment is rendered to a normalized 1920x1080/30fps clip, the clips are concatenated, and the
narration clips are placed at their segment offsets. Terminal footage is real; speed-ups are labeled.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORK = ROOT / "work"
CARDS = ROOT / "cards"
VO = WORK / "vo-kokoro"  # Kokoro-82M, voice af_heart (see narration.tsv)
VO_EXT = ".wav"
SEG = WORK / "segments"
SEG.mkdir(parents=True, exist_ok=True)
FPS = 30
FADE = 0.25


def run(cmd):
    print("+", " ".join(str(c) for c in cmd)[:240], flush=True)
    subprocess.run([str(c) for c in cmd], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


# A segment: kind card | clip | freeze, its length, overlays [(png, start, end)], narration [(clip, offset)].
# clip: src, a, b (source seconds), speed. freeze: src, at. card: png.
SEGMENTS = json.loads((ROOT / "timeline.json").read_text())


def overlay_chain(base_label, overlays, dur):
    """Overlay PNGs (inputs 1..n) with alpha fade in/out, each visible for [start, end] within the segment."""
    filters, label = [], base_label
    for i, ov in enumerate(overlays, start=1):
        start, end = ov["start"], min(ov["end"], dur)
        filters.append(
            f"[{i}:v]format=rgba,fade=t=in:st={start}:d=0.3:alpha=1,fade=t=out:st={max(start, end - 0.3)}:d=0.3:alpha=1[ov{i}]"
        )
        filters.append(f"[{label}][ov{i}]overlay=0:0:enable='between(t,{start},{end})'[v{i}]")
        label = f"v{i}"
    return filters, label


def render_segment(idx, seg):
    out = SEG / f"seg_{idx:02d}.mp4"
    dur = seg["dur"]
    inputs, pre = [], []
    if seg["kind"] == "card":
        inputs = ["-loop", "1", "-t", f"{dur}", "-i", CARDS / seg["png"]]
        # A slow push-in keeps stills alive without distracting from the text.
        zoom = seg.get("zoom", 0.035)
        pre = [
            f"[0:v]scale=2304:1296,zoompan=z='1+{zoom}*on/({dur}*{FPS})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(dur * FPS)}:s=1920x1080:fps={FPS},setsar=1[base]"
        ]
    elif seg["kind"] == "clip":
        src = ROOT / seg["src"]
        a, b, k = seg["a"], seg["b"], seg.get("speed", 1.0)
        inputs = ["-ss", f"{a}", "-to", f"{b}", "-i", src]
        crop = seg.get("crop")  # [w, h, x, y] zoom into a region (e.g. the install summary)
        chain = f"[0:v]setpts=(PTS-STARTPTS)/{k},fps={FPS}"
        if crop:
            chain += f",crop={crop[0]}:{crop[1]}:{crop[2]}:{crop[3]},scale=1920:1080:flags=lanczos"
        else:
            chain += ",scale=1920:1080:flags=lanczos"
        chain += f",tpad=stop_mode=clone:stop_duration=30,trim=duration={dur},setsar=1[base]"
        pre = [chain]
    elif seg["kind"] == "freeze":
        src = ROOT / seg["src"]
        frame = WORK / f"freeze_{idx:02d}.png"
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{seg['at']}", "-i", src, "-frames:v", "1", frame])
        inputs = ["-loop", "1", "-t", f"{dur}", "-i", frame]
        pre = [f"[0:v]fps={FPS},scale=1920:1080,setsar=1[base]"]
    else:
        raise ValueError(seg["kind"])

    overlays = seg.get("overlays", [])
    for ov in overlays:
        inputs += ["-loop", "1", "-t", f"{dur}", "-i", CARDS / ov["png"]]
    filters, label = overlay_chain("base", overlays, dur)
    badge = seg.get("badge")  # e.g. "▶▶ 10×" rendered as a card PNG
    graph = pre + filters
    if badge:
        inputs += ["-loop", "1", "-t", f"{dur}", "-i", CARDS / badge]
        n = len(overlays) + 1
        graph.append(f"[{n}:v]format=rgba[bdg]")
        graph.append(f"[{label}][bdg]overlay=0:0[vb]")
        label = "vb"
    graph.append(f"[{label}]fade=t=in:st=0:d={FADE},fade=t=out:st={dur - FADE}:d={FADE},format=yuv420p[out]")
    run(
        ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", "[out]", "-t", f"{dur}",
         "-r", f"{FPS}", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out]
    )
    return out


def main():
    # Segments are cached in work/segments; pass indices to re-render them, or --all for everything.
    args = set(sys.argv[1:])
    clips, cursor, voice = [], 0.0, []
    for idx, seg in enumerate(SEGMENTS):
        path = SEG / f"seg_{idx:02d}.mp4"
        if "--all" in args or str(idx) in args or not path.exists():
            path = render_segment(idx, seg)
        clips.append(path)
        for vo in seg.get("vo", []):
            voice.append((VO / f"{vo['clip']}{VO_EXT}", cursor + vo.get("at", 0.0)))
        cursor += seg["dur"]
    print(f"timeline: {cursor:.1f}s, {len(clips)} segments, {len(voice)} narration clips")

    listing = WORK / "concat.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in clips))
    silent = WORK / "video_only.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", silent])

    inputs, parts = [], []
    for i, (clip, start) in enumerate(voice):
        inputs += ["-i", clip]
        ms = int(start * 1000)
        parts.append(f"[{i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay={ms}|{ms},volume=1.0[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(voice)))
    graph = ";".join(parts + [f"{mix}amix=inputs={len(voice)}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]"])
    final = ROOT / "mermail-email-e2e-demo.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", silent, *inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[aout]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", "-movflags", "+faststart", final])
    print(f"wrote {final} ({duration(final):.1f}s, {final.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
