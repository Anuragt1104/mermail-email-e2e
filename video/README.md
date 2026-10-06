# Demo video

[`mermail-email-e2e-demo.mp4`](mermail-email-e2e-demo.mp4) · 2:55 · 1080p

**Everything in the terminal is a real recording**: Claude Code 2.1.289 (Opus 5.5) on macOS, the hosted Mermail MCP server, and a Mermail Free-plan mailbox. Nothing is mocked. Waiting time is sped up, and every sped-up segment carries an on-screen `▶▶ N× speed` badge. The two "runner output" insets are the session's real tool output, shown expanded because Claude Code collapses long tool results; their passing lines are trimmed, and the inset is labelled to say so.

| Take | What it records | Real duration |
| --- | --- | --- |
| A | `ls`, `cat .mcp.json`, `npx skills add Anuragt1104/mermail-email-e2e` | 31 s |
| B | One prompt in Claude Code: the skill loads, resolves the mailbox through Mermail MCP, writes the spec, runs the suite (**29 passed · 5 failed**), fixes three bugs, and re-runs (**34 passed · 0 failed**) | 4 min 20 s from prompt to green |
| C | `git diff` of the agent's fixes, then the same suite run without an agent (CI mode) | 3 min |

## How it was made

1. **Terminal takes**: [VHS](https://github.com/charmbracelet/vhs) tapes in [`tapes/`](tapes/), using a Mermail-branded theme ([`theme.tape`](tapes/theme.tape)) and the recording-only shell setup in [`demo-env.zsh`](tapes/demo-env.zsh).
2. **Title cards, captions, insets, badges**: HTML in [`cards/`](cards/), rendered to PNG with headless Chrome (`cards/render.sh`).
3. **Narration**: [`narration.tsv`](narration.tsv), synthesized locally with [Kokoro-82M](https://github.com/thewh1teagle/kokoro-onnx), an open-weights Apache-2.0 neural TTS model (voice `af_heart`, speed 1.0). [`fitcheck.py`](fitcheck.py) checks that every clip fits its segment without colliding with the next one.
4. **Edit**: [`timeline.json`](timeline.json) lists every segment, with its source range, speed, overlays, and narration offsets. [`build.py`](build.py) renders the segments with ffmpeg, concatenates them, and mixes the narration (loudness-normalized to −16 LUFS).

```bash
cd video && python3 build.py   # needs ffmpeg plus the takes in video/work/ (gitignored)
```
