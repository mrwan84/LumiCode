#!/usr/bin/env bash
#
# LumiCode - Claude Code Hook Script
#
# Install this as a Claude Code hook to notify LumiCode when tasks complete.
#
# Usage in Claude Code settings (~/.claude/settings.json):
#
#   {
#     "hooks": {
#       "PostToolUse": [
#         {
#           "matcher": "",
#           "command": "/path/to/claude-hook.sh working"
#         }
#       ],
#       "Notification": [
#         {
#           "matcher": "",
#           "command": "/path/to/claude-hook.sh done"
#         }
#       ],
#       "Stop": [
#         {
#           "matcher": "",
#           "command": "/path/to/claude-hook.sh done"
#         }
#       ]
#     }
#   }

LUMICODE_URL="http://localhost:9999/hook"
EVENT="${1:-done}"

curl -s -X POST "$LUMICODE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"event\": \"$EVENT\"}" \
  > /dev/null 2>&1

exit 0
