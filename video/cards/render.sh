#!/bin/zsh
# render.sh <name> [transparent]  → <name>.png (1920x1080)
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
extra=()
[[ "$2" == "transparent" ]] && extra=(--default-background-color=00000000)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1920,1080 \
  --virtual-time-budget=4000 "${extra[@]}" --screenshot="$PWD/$1.png" "file://$PWD/$1.html" >/dev/null 2>&1
ls -la "$1.png" | awk '{print $5, $NF}'
