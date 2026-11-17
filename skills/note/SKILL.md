---
name: note
description: Saves bits of the conversation to the user's Apple Notes and reads them back (macOS). Use this whenever the user's message contains the literal token "/note" anywhere - at the start ("/note buy milk", "/note [Decision] use SQLite", a bare "/note"), in the middle or at the end ("what did we decide? /note", "show me Decisions from /note", "list the diagrams in /note"). Do not use it when "/note" does not appear in the message.
---

# Note It Down!

Saves entries into one Apple Note per chat session, in the **Claude Notes** folder of the
default Notes account, and reads them back. All Notes access goes through the helper script
`scripts/note.js` (macOS JavaScript for Automation). Never touch Notes any other way.

## 1. Decide what to do (strict, no guessing)

Look only at where the literal token `/note` sits in the user's message
(`/note-it-down:note` counts as `/note`):

| Message | Action |
|---|---|
| Starts with `/note` followed by text (same line or next lines) | **SAVE** that text. Always a save, even if it reads like a question or a request. |
| Only `/note` (nothing else but whitespace) | **SUMMARY**: read the note and summarise it (section 5). Save nothing. |
| `/note` anywhere else in the message | **READ**: read the note and use it to answer the rest of the message. Never save. If the message asks to save something, don't; remind the user that saving only happens when the message *starts* with `/note` (if you show an example, use their words unchanged and add no label). |
| No `/note` | Not this skill. Don't touch Notes. The one exception is the user's direct yes/no answer to the attachment question in section 3. |

The note in Apple Notes is the only source of truth: the user may add or edit entries there by
hand. Run the helper again for every `/note` message, even if you read the note a moment ago.

## 2. Where you are, and how to run the helper

Session ID given to this skill: `${CLAUDE_SESSION_ID}`

### Claude Code (the line above shows a UUID)

- Short ID = the first 8 characters of that session ID.
- Helper: `${CLAUDE_SKILL_DIR}/scripts/note.js`. Run it with the Bash tool:
  `osascript -l JavaScript "${CLAUDE_SKILL_DIR}/scripts/note.js" <command> ...`

### Regular Claude chat (the line above still shows a `${...}` placeholder)

Apple Notes is only reachable through a tool that runs shell commands **on the user's Mac**
(the Claude desktop app's device shell tool, available only while the app is open and linked
to the Mac). Your own code sandbox is a separate Linux machine and cannot reach Notes.

1. If you have no tool that runs commands on the user's Mac, say plainly that Apple Notes
   can't be reached from here (it needs the Claude desktop app on the Mac) and stop.
2. Run `uname -s` with that tool. If it is not `Darwin`, it is not the Mac: say so and stop.
3. Install the helper once (skip if the check prints `present`):
   `test -f "$HOME/Library/Application Support/note-it-down/note-0.1.0.js" && echo present`
   To install, read `scripts/note.js` from this skill's folder and write it to the Mac
   **verbatim** (no edits, no shortening):
   ```
   mkdir -p "$HOME/Library/Application Support/note-it-down" && cat > "$HOME/Library/Application Support/note-it-down/note-0.1.0.js" <<'NOTE_IT_DOWN_JS_EOF'
   <the full contents of scripts/note.js>
   NOTE_IT_DOWN_JS_EOF
   ```
4. Helper: `osascript -l JavaScript "$HOME/Library/Application Support/note-it-down/note-0.1.0.js" <command> ...`
5. Short ID: on the first save in this conversation, make up a random 8-character ID of
   lowercase letters and digits. Reuse it for every later `/note` in this conversation (it is
   at the end of the note title in your earlier save confirmations). If you are reading and no
   save has happened in this conversation yet, there is no ID: reply "Nothing saved yet."

## 3. Saving

Pass the user's text **exactly as typed**: everything after the leading `/note` and the one
space (or line break) after it, character for character, including any `[Label]`, Markdown and
code fences. Do not fix, reword, trim, translate, summarise or add a label. Labels come only
from the user.

```
osascript -l JavaScript "<helper>" save --id <SHORT_ID> --title "<2-6 word title>" <<'NOTE_IT_DOWN_EOF'
<the user's text, verbatim>
NOTE_IT_DOWN_EOF
```

- `--title`: 2-6 plain words taken from this entry (without the label). The helper uses it
  only when it creates the note, as `<YYYY-MM-DD>_<title>_<SHORT_ID>`; later saves ignore it.
- The heredoc delimiter is quoted, so nothing in the text is expanded. If the text itself
  contains a line `NOTE_IT_DOWN_EOF`, pick another delimiter.
- Markdown becomes Notes formatting. Code blocks, Mermaid diagrams included, are saved as
  code in a monospace font; no pictures are made.
- The first run may show a macOS prompt asking to let the app control Notes. Never try to
  get around it; the user clicks Allow.

Reply with one short line, e.g. `Saved to "2026-11-17_Pick a database_ab12cd34" (entry 3).`
Mention when the folder or note was just created.

**If the note has pictures or attachments** (`"code": "attachments-would-be-lost"`): nothing
was saved. Apple Notes only lets scripts add text by rewriting the whole note, which can delete
pictures and attachments the user added by hand, or leave them broken. Tell the user how many
the note has (`attachments`), that saving may delete them or break them, and ask whether to
save anyway. Then:
- Only if the user clearly says yes in their reply, run the **same** save again (same text,
  same ID) with `--allow-attachment-loss` added. Tell them the entry was saved and that they
  should check the note's pictures (`attachmentsBefore` / `attachmentsAfter` are counts only;
  a picture can be broken even when the count is unchanged).
- If they say no, or anything else, save nothing.
- Never pass `--allow-attachment-loss` on your own, and never reuse an earlier yes for a later
  save: each save into a note with attachments needs its own yes.

## 4. Reading

```
osascript -l JavaScript "<helper>" read --id <SHORT_ID>
```

`read` never creates anything. If it returns `"found": false`, reply "Nothing saved yet."
Otherwise it returns `title`, `entryCount`, `labels` (in order of first appearance),
`attachments` (pictures/attachments in the whole note) and `entries`. Each entry has `label`
(or null), `text` (code shown as fenced blocks, Mermaid as ```` ```mermaid ````), `time` (null
for entries typed by hand in Notes; treat those as normal entries), `diagrams` (Mermaid
`source` found in the entry) and `attachments` (pictures/attachments in the entry, shown in
the text as `[picture or attachment]`).

## 5. Answer formats

**Bare `/note` (summary)**
- Header: the note title and the number of entries.
- Entries grouped by label, labels in the order each first appears; unlabeled entries last,
  under "No label".
- One short line per entry. A diagram becomes a one-line description of what it shows.

**Asking for a label** (e.g. "show me Decisions from /note")
- Match labels ignoring upper/lower case and singular/plural ("Decisions" finds `[Decision]`).
- Show those entries in full, each with its time stamp (or "no time stamp" if typed by hand).
- If no entry has that label, say so and list the labels that do exist.

**Asking for diagrams**
- Find every entry with Mermaid source, whatever its label (`diagrams[].source`, plus any
  entry text that is plainly Mermaid code).
- Show the source in a ```` ```mermaid ```` block. In regular chat, also draw the diagram.
- For pictures without source (`attachments`), say they exist and in which entry. Don't guess
  what they show.

**Any other `/note` question**: answer it from the entries.

## 6. When something goes wrong

The helper prints JSON. If `"ok": false`, explain `error` in plain words; never retry another
way (the only retry is the confirmed `--allow-attachment-loss` save in section 3).

- `not-authorized`: macOS is blocking control of Notes. Tell the user to turn on Notes for
  this app in System Settings > Privacy & Security > Automation, then try again.
- `attachments-would-be-lost`: see section 3.
- `osascript` not found, or not macOS: Apple Notes is only reachable on a Mac.
