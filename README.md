<p align="center">
  <img src="assets/icon.png" alt="Note It Down! icon" width="112">
</p>

<h1 align="center">Note It Down!</h1>

<p align="center"><b>Your Claude chat notes, kept in Apple Notes.</b><br>A Claude skill for Claude Code and the Claude Desktop app on macOS.</p>

Save bits of your Claude conversation into **Apple Notes** with one command, `/note`, and read them back later in the same chat. Every chat session gets its own note in a **Claude Notes** folder, so your decisions, ideas and diagrams stay in one place you can open, edit and sync like any other note.

## Where it works

| Where | Works? | Notes |
|---|---|---|
| Claude Code on macOS (terminal or the Code tab of the Claude Desktop app) | ✅ | Runs the Notes script directly on your Mac. |
| Regular chat in the **Claude Desktop app on macOS** | ✅ | Needs the **Note It Down! desktop extension** (Option B below), which runs the Notes script on your Mac. |
| Windows, Linux, iPhone/iPad, or a browser with no Claude Desktop app on a Mac | ❌ | Apple Notes is only reachable on a Mac. Claude will tell you it can't reach Notes. |

## Requirements

- A Mac running macOS with **Apple Notes** (built in).
- **Claude Desktop app** for macOS with the Note It Down! extension (for chat), and/or **Claude Code** (for the terminal or the Code tab).
- A Claude plan that supports Skills (needed to upload the skill in the Desktop app).

Nothing else to install: no Node.js, no Python, no downloads.

## What it uses on your Mac

No surprises. This is the complete list:

| Component | What it's used for | Installed by you? |
|---|---|---|
| **Apple Notes** | Stores your notes in the "Claude Notes" folder | Built into macOS |
| **`osascript` (JavaScript for Automation)** | Runs [`skills/note/scripts/note.js`](skills/note/scripts/note.js), which creates the folder and notes, adds entries and reads notes back | Built into macOS |
| **Note It Down! desktop extension** (regular chat only) | Gives chat two tools, `note_save` and `note_read`, which run the same `note.js` with `osascript`. Source: [`extension/server/index.js`](extension/server/index.js) | You install it (one click). It uses the Node.js built into Claude Desktop, so there's nothing else to install |

The script only talks to Apple Notes. It and the extension run no other programs, download nothing and write no files.

**Network:** the skill itself sends nothing anywhere. If your Notes default account is iCloud, Apple syncs the notes to your other devices as usual.

## Permissions you'll be asked for

1. **macOS: "… wants access to control Notes"**: appears the first time the skill runs (the app named is Terminal, Claude, or Claude Code). Click **Allow**. The skill never tries to get around this prompt.
   - Clicked "Don't Allow" by mistake? Go to **System Settings → Privacy & Security → Automation** and turn on **Notes** for that app.
2. **Claude Code: approval to run commands**: Claude Code may ask before running `osascript`. Approve to continue.
3. **Claude Desktop chat: approval to use the extension's tools**: Claude may ask before calling `note_save` or `note_read`. Allow it, once or always.

## Install

There are two ways to install, one for each place Claude runs:

| You use | Install from |
|---|---|
| **Claude Code** (terminal or the Code tab) | This GitHub repo, as a plugin (Option A) |
| **Regular chat in the Claude Desktop app** | Two files from Releases: `note-it-down.mcpb` and `note-it-down.zip` (Option B) |

### Option A: Claude Code (terminal or Code tab)

In a Claude Code session, run:

```
/plugin marketplace add EwanMarkow/note-it-down
/plugin install note-it-down@note-it-down
```

### Option B: Claude Desktop app (regular chat)

Regular chat needs two files from this repo's **Releases** page. You don't need either one for Claude Code.

| File | What it is | Why chat needs it |
|---|---|---|
| **`note-it-down.mcpb`** | A Claude Desktop extension | Chat can't run commands on your Mac by itself. The extension runs the Notes script for it. |
| **`note-it-down.zip`** | The skill (`SKILL.md` + `scripts/note.js`, the same files as in this repo) | Teaches Claude the `/note` rules. Chat can't install plugins from GitHub; it only accepts a skill uploaded as a ZIP. |

1. **Install the extension:** download `note-it-down.mcpb` and double-click it. Claude Desktop opens it; click **Install**. (Or drag it onto **Settings → Extensions**.)
2. **Upload the skill:** download `note-it-down.zip`. In Claude, open **Customize → Skills**, click **+**, then **+ Create skill → Upload a skill**, and choose the ZIP. Make sure the skill is turned on.
3. **Start a new chat** in the Claude Desktop app on your Mac.

### Check it works

Type:

```
/note hello
```

Open Apple Notes. You should see a **Claude Notes** folder with a new note in it.

## How to use

| You type | What happens |
|---|---|
| `/note [Decision] Use Apple Notes` | **Saves** the text exactly as typed, with your label. |
| `/note Use Apple Notes` | **Saves** the text exactly as typed, without a label. |
| `/note` | **Shows a summary** of everything in this session's note, grouped by label. Saves nothing. |
| `show me Decisions from /note` | **Reads the note** and answers your question with it. Saves nothing. |
| (no `/note` in the message) | Claude doesn't touch your notes. |

**Rules worth knowing**
- A message that **starts** with `/note` + text is **always saved**, even if it looks like a question. To ask about your notes, put `/note` somewhere else in the message: `what did I decide about labels in /note?`
- **Labels** are optional: put `[AnyWord]` at the start of your text. Only you add labels; Claude never adds or changes them.
- Asking for a label ignores plural and upper/lower case: "Decisions" finds `[Decision]`.
- In Claude Code the command is `/note`. If another installed plugin also has a skill called `note`, use the full name `/note-it-down:note`.

## How it works, start to finish

1. **You type `/note …`** in Claude Code or the Claude Desktop app.
2. **Claude runs a small script on your Mac** with `osascript` (directly in Claude Code; through the Note It Down! extension in chat).
3. **First save in a session:**
   - If the **Claude Notes** folder doesn't exist in your default Notes account, it's created.
   - A new note is created, titled `YYYY-MM-DD_<first-note-title>_<short-id>`. In Claude Code the short ID is the first 8 characters of the session ID; in chat Claude makes up a random 8-character ID.
4. **Every later save** in the same session re-reads that note and adds an entry at the end: your text, plus a gray time stamp. Markdown becomes real Notes formatting: headings, bold, italics, lists, and code in a monospace font.
5. **Diagrams** are saved as their Mermaid code, in a monospace font. Ask for them later (`show the diagrams in /note`) and Claude shows the code; in regular chat it also draws them.
6. **Reading** (`/note` alone or in the middle of a message) **always re-reads the note fresh**, so anything you added or edited by hand in Apple Notes is included. Reading never creates anything.

## Where your notes live

- **Apple Notes → Claude Notes** folder, in your default Notes account (usually iCloud).
- **One note per chat session.**
- They're normal notes: edit, move, share or delete them like any other note. Entries you type by hand are treated like saved ones. Separate your own entries with an empty line.

## Limitations

- **Mac only.** Needs Apple Notes and AppleScript.
- **In chat, `/note` only works in the Claude Desktop app on a Mac with the extension installed.** In claude.ai in a browser, on a phone, or without the extension, Claude says it can't reach Notes and stops.
- **Diagrams are saved as code, not pictures.** Apple Notes doesn't let scripts insert pictures that display reliably.
- **Pictures or attachments you add to a session's note by hand can be lost.** Apple Notes only lets scripts add text by rewriting the whole note, which can delete them or leave them broken. So when the note has any, `/note` saves nothing at first: Claude tells you how many there are and asks whether to save anyway. Answer yes to save (they may be deleted or broken), or no to save nothing. You're asked again for every such save. To avoid this, keep pictures in a different note.
- **Claude can't see images you paste by hand.** It will say they exist but won't guess what's in them.
- **Some formatting is simplified.** Apple Notes ignores small font sizes and block quotes from scripts, so time stamps are gray rather than small, and quotes are shown in italics.
- **Saving only works with `/note` at the start of a message.** A `/note` in the middle never saves.
- **Text you save passes through your Claude conversation**, like anything else you type in the chat.

## Uninstall

- **Claude Code:** `/plugin uninstall note-it-down@note-it-down`
- **Claude Desktop app:** Customize → Skills → remove **note**, and Settings → Extensions → remove **Note It Down!**
- Your notes stay in Apple Notes. Delete the **Claude Notes** folder yourself if you don't want them.

## For maintainers

- Layout: `.claude-plugin/` (plugin and marketplace manifests), `skills/note/` (`SKILL.md` and `scripts/note.js`), `extension/` (desktop extension `manifest.json` and `server/index.js`), `assets/` (icon).
- `scripts/build-release.sh` builds both release files into `dist/`: `note-it-down.zip` (the skill, named `note` like in the plugin, so the command is `/note` everywhere) and `note-it-down.mcpb` (the extension, with a copy of `note.js`, packed with the pinned `@anthropic-ai/mcpb@2.1.2`). Attach both to the GitHub Release.
- When you bump the version, change it in `plugin.json`, `marketplace.json`, `extension/manifest.json`, and `VERSION` in `note.js` and `extension/server/index.js`. The build script checks they match.
- Check the plugin with `claude plugin validate .`

## License

[MIT](LICENSE) © Ivan Markov
