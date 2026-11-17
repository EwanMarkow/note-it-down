#!/bin/sh
# Builds dist/note-it-down.zip for uploading in Claude (Customize -> Skills).
# The ZIP holds one folder, note-it-down/, with SKILL.md and scripts/note.js.
# In the ZIP the skill is named "note-it-down" (in the plugin it is "note", for /note).
set -eu

cd "$(dirname "$0")/.."

version=$(sed -n 's/^const VERSION = '\''\(.*\)'\'';$/\1/p' skills/note/scripts/note.js)
[ -n "$version" ] || { echo "Could not read VERSION from note.js" >&2; exit 1; }

# Every place that names the version must agree.
grep -q "\"version\": \"$version\"" .claude-plugin/plugin.json || { echo "plugin.json version != $version" >&2; exit 1; }
grep -q "\"version\": \"$version\"" .claude-plugin/marketplace.json || { echo "marketplace.json version != $version" >&2; exit 1; }
grep -q "note-$version.js" skills/note/SKILL.md || { echo "SKILL.md does not use note-$version.js" >&2; exit 1; }

rm -rf dist
mkdir -p dist/note-it-down/scripts
sed 's/^name: note$/name: note-it-down/' skills/note/SKILL.md > dist/note-it-down/SKILL.md
cp skills/note/scripts/note.js dist/note-it-down/scripts/note.js
cp LICENSE dist/note-it-down/LICENSE

(cd dist && zip -qrX note-it-down.zip note-it-down)
echo "Built dist/note-it-down.zip (version $version)"
unzip -l dist/note-it-down.zip
