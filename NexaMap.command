#!/bin/bash
# Double-click to launch NexaMap locally in your browser.
# Opens a Terminal window with the live server log; close it (or Ctrl-C) to stop.
cd "$(dirname "$0")" || exit 1
exec ./nexamap-run.sh
