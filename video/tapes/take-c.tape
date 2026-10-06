Source tapes/theme.tape
Output work/take-c.mp4
Set Framerate 20
Hide
Type "source tapes/demo-env.zsh && clear" Enter
Sleep 1s
Show
Sleep 600ms
Type "git --no-pager diff --stat"
Sleep 300ms
Enter
Sleep 3s
Type "git --no-pager diff --color=always -U1 -- emails/verify.html server.mjs | head -42"
Sleep 300ms
Enter
Sleep 9s
Type "clear"
Enter
Sleep 300ms
Type "node .claude/skills/mermail-email-e2e/scripts/run-email-e2e.mjs"
Sleep 400ms
Enter
Sleep 170s
