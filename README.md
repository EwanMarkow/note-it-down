<img src="assets/icon.png" alt="Note It Down! icon" width="96" align="right">

# Note It Down!

Save bits of your Claude conversation into **Apple Notes** with one command, `/note`, and read them back later in the same chat. Every chat session gets its own note in a **Claude Notes** folder, so your decisions, ideas and diagrams stay in one place you can open, edit and sync like any other note.

---

## Where it works

| Where | Works? | Notes |
|---|---|---|
| Claude Code on macOS (terminal or the Code tab of the Claude Desktop app) | ✅ | Runs the Notes script directly on your Mac. |
| Regular chat in the **Claude Desktop app on macOS** | ✅ | Claude runs the Notes script on your Mac through the desktop app, so the app must be open on that Mac. |
| Windows, Linux, iPhone/iPad, or a browser with no Claude Desktop app on a Mac | ❌ | Apple Notes is only reachable on a Mac. Claude will tell you it can't reach Notes. |

---

## Requirements

- A Mac running macOS with **Apple Notes** (built in).
- **Claude Desktop app** for macOS (for chat), and/or **Claude Code** (for the terminal or the Code tab).
- A Claude plan that supports Skills (needed to upload the skill in the Desktop app).

Nothing else to install: no Node.js, no Python, no downloads.

---

## What it uses on your Mac

No surprises. This is the complete list:

| Component | What it's used for | Installed by you? |
|---|---|---|
| **Apple Notes** | Stores your notes in the "Claude Notes" folder | Built into macOS |
| **`osascript` (JavaScript for Automation)** | Runs [`skills/note/scripts/note.js`](skills/note/scripts/note.js), which creates the folder and notes, adds entries and reads notes back | Built into macOS |
| **Helper copy (regular chat only)** | In regular chat, Claude copies `note.js` once to `~/Library/Application Support/note-it-down/`, because the skill's files live on Claude's side, not on your Mac | Created automatically |

The script only talks to Apple Notes. It runs no other programs, downloads nothing and writes no other files.

**Network:** the skill itself sends nothing anywhere. If your Notes default account is iCloud, Apple syncs the notes to your other devices as usual.

---

## Permissions you'll be asked for

1. **macOS: "… wants access to control Notes"**: appears the first time the skill runs (the app named is Terminal, Claude, or Claude Code). Click **Allow**. The skill never tries to get around this prompt.
   - Clicked "Don't Allow" by mistake? Go to **System Settings → Privacy & Security → Automation** and turn on **Notes** for that app.
2. **Claude Code: approval to run commands**: Claude Code may ask before running `osascript`. Approve to continue.

---

## Install

There are two ways to install, one for each place Claude runs:

| You use | Install from |
|---|---|
| **Claude Code** (terminal or the Code tab) | This GitHub repo, as a plugin (Option A) |
| **Regular chat in the Claude Desktop app** | The `note-it-down.zip` file from Releases (Option B) |

### Option A: Claude Code (terminal or Code tab)

In a Claude Code session, run:

```
/plugin marketplace add EwanMarkow/note-it-down
/plugin install note-it-down@note-it-down
```

### Option B: Claude Desktop app (regular chat)

**What the ZIP is for:** regular chat can't install plugins from GitHub. It only accepts a skill uploaded as a ZIP file in **Customize → Skills**. `note-it-down.zip` is exactly that: one folder with `SKILL.md` and `scripts/note.js`, the same files as in this repo. You don't need it for Claude Code.

1. Download **`note-it-down.zip`** from this repo's **Releases** page.
2. In Claude, open **Customize → Skills**, click **+**, then **+ Create skill → Upload a skill**, and choose the ZIP.
3. Make sure the skill is turned on.
4. Chat in the **Claude Desktop app on your Mac**, with the app open.

### Check it works

Type:

```
/note hello
```

Open Apple Notes. You should see a **Claude Notes** folder with a new note in it.

---

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

---

## How it works, start to finish

1. **You type `/note …`** in Claude Code or the Claude Desktop app.
2. **Claude runs a small script on your Mac** with `osascript` (directly in Claude Code; through the desktop app in chat).
3. **First save in a session:**
   - If the **Claude Notes** folder doesn't exist in your default Notes account, it's created.
   - A new note is created, titled `YYYY-MM-DD_<first-note-title>_<short-id>`. In Claude Code the short ID is the first 8 characters of the session ID; in chat Claude makes up a random 8-character ID.
4. **Every later save** in the same session re-reads that note and adds an entry at the end: your text, plus a gray time stamp. Markdown becomes real Notes formatting: headings, bold, italics, lists, and code in a monospace font.
5. **Diagrams** are saved as their Mermaid code, in a monospace font. Ask for them later (`show the diagrams in /note`) and Claude shows the code; in regular chat it also draws them.
6. **Reading** (`/note` alone or in the middle of a message) **always re-reads the note fresh**, so anything you added or edited by hand in Apple Notes is included. Reading never creates anything.

---

## Where your notes live

- **Apple Notes → Claude Notes** folder, in your default Notes account (usually iCloud).
- **One note per chat session.**
- They're normal notes: edit, move, share or delete them like any other note. Entries you type by hand are treated like saved ones. Separate your own entries with an empty line.

---

## Limitations

- **Mac only.** Needs Apple Notes and AppleScript.
- **In chat, the Claude Desktop app must be open on your Mac.** Otherwise Claude says it can't reach Notes and stops.
- **Diagrams are saved as code, not pictures.** Apple Notes doesn't let scripts insert pictures that display reliably.
- **Pictures or attachments you add to a session's note by hand can be lost.** Apple Notes only lets scripts add text by rewriting the whole note, which can delete them or leave them broken. So when the note has any, `/note` saves nothing at first: Claude tells you how many there are and asks whether to save anyway. Answer yes to save (they may be deleted or broken), or no to save nothing. You're asked again for every such save. To avoid this, keep pictures in a different note.
- **Claude can't see images you paste by hand.** It will say they exist but won't guess what's in them.
- **Some formatting is simplified.** Apple Notes ignores small font sizes and block quotes from scripts, so time stamps are gray rather than small, and quotes are shown in italics.
- **Saving only works with `/note` at the start of a message.** A `/note` in the middle never saves.
- **Text you save passes through your Claude conversation**, like anything else you type in the chat.

---

## Uninstall

- **Claude Code:** `/plugin uninstall note-it-down@note-it-down`
- **Claude Desktop app:** Customize → Skills → remove **note-it-down**
- Your notes stay in Apple Notes. Delete the **Claude Notes** folder yourself if you don't want them.
- Regular chat only: delete `~/Library/Application Support/note-it-down` (the helper copy).

---

## For maintainers

- Plugin layout: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/note/SKILL.md`, `skills/note/scripts/note.js`.
- Build the ZIP for Releases with `scripts/build-skill-zip.sh` (writes `dist/note-it-down.zip`), then attach it to a GitHub Release. In the ZIP the skill is named `note-it-down`; in the plugin it stays `note`, so the command is `/note`.
- When you bump the version, change it in `plugin.json`, `marketplace.json`, `VERSION` in `note.js`, and the `note-<version>.js` file name in `SKILL.md`. The build script checks they match.
- Check the plugin with `claude plugin validate .`

---

## License

[MIT](LICENSE) © Ivan Markov
