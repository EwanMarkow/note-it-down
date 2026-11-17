#!/bin/sh
# Builds both release files into dist/:
#   note-it-down.zip   the skill, for Customize -> Skills in the Claude Desktop app
#   note-it-down.mcpb  the desktop extension that lets regular chat reach Apple Notes
# In the ZIP the skill is named "note-it-down" (in the plugin it is "note", for /note).
set -eu

cd "$(dirname "$0")/.."
MCPB="@anthropic-ai/mcpb@2.1.2" # official packaging tool, pinned

version=$(sed -n 's/^const VERSION = '\''\(.*\)'\'';$/\1/p' skills/note/scripts/note.js)
[ -n "$version" ] || { echo "Could not read VERSION from note.js" >&2; exit 1; }

# Every place that names the version must agree.
check() { grep -q "$2" "$1" || { echo "$1 does not have version $version" >&2; exit 1; }; }
check .claude-plugin/plugin.json "\"version\": \"$version\""
check .claude-plugin/marketplace.json "\"version\": \"$version\""
check extension/manifest.json "\"version\": \"$version\""
check extension/server/index.js "const VERSION = '$version';"

rm -rf dist
mkdir -p dist/note-it-down/scripts dist/extension/server

# Skill ZIP
sed 's/^name: note$/name: note-it-down/' skills/note/SKILL.md > dist/note-it-down/SKILL.md
cp skills/note/scripts/note.js dist/note-it-down/scripts/note.js
cp LICENSE dist/note-it-down/LICENSE
(cd dist && zip -qrX note-it-down.zip note-it-down)

# Desktop extension (.mcpb), using the same note.js
cp extension/manifest.json assets/icon.png LICENSE dist/extension/
cp extension/server/index.js skills/note/scripts/note.js dist/extension/server/
npx -y "$MCPB" validate dist/extension/manifest.json
npx -y "$MCPB" pack dist/extension dist/note-it-down.mcpb

echo
echo "Built version $version:"
ls -l dist/note-it-down.zip dist/note-it-down.mcpb
