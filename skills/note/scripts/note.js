// Note It Down! - Apple Notes helper for the /note skill.
//
// Runs with macOS's built-in JavaScript for Automation (JXA):
//
//   osascript -l JavaScript note.js save --id <8-char id> --title "<short title>" [--allow-attachment-loss]  < entry.md
//   osascript -l JavaScript note.js read --id <8-char id>
//
// "save" reads the entry text (Markdown) from stdin, appends it to this session's
// note in the "Claude Notes" folder (creating the folder/note on the first save),
// and prints a JSON result. "read" never creates anything; it prints the note's
// entries as JSON.
//
// It only talks to Apple Notes (macOS asks you once to allow this). It downloads
// nothing, runs no other programs and writes no files.
//
// About attachments: Apple Notes only lets scripts change a note by replacing its
// whole text, and that deletes (or leaves broken) pictures and attachments in it. So if the note has
// attachments, "save" stops and reports how many, unless --allow-attachment-loss is
// given (the skill passes it only after the user says yes).

const VERSION = '0.2.2';
const FOLDER_NAME = 'Claude Notes';
const GRAY = 'color: #8e8e93'; // Notes keeps text colors, but drops small font sizes
const STAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const OBJECT_CHAR = '\uFFFC'; // how Notes' plain text shows a picture or attachment
const MONOSPACE_FONT_RE = /<font face="(?:Courier|Courier New|Menlo|Monaco|SF Mono)"[^>]*>[\s\S]*?<\/font>/gi;
const MERMAID_START_RE = new RegExp('^\\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|' +
  'erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4\\w*|mindmap|timeline|zenuml|' +
  '(sankey|xychart|block|packet|architecture|radar|treemap)(-beta)?|kanban)\\b');

// ---------------------------------------------------------------- entry point

function run(argv) {
  let result;
  try {
    const cmd = argv[0];
    const opts = parseOptions(argv.slice(1));
    if (cmd === 'save') {
      result = save(requireId(opts), opts.title || '', opts['allow-attachment-loss'] === true);
    } else if (cmd === 'read') {
      result = read(requireId(opts));
    } else if (cmd === 'version') {
      result = { ok: true, version: VERSION };
    } else {
      result = fail('usage', 'Usage: note.js save|read --id <8-char id> [--title "<title>"] [--allow-attachment-loss]');
    }
  } catch (e) {
    result = notesError(e);
  }
  return JSON.stringify(result, null, 2);
}

// "--name value" pairs; a flag with no value (or followed by another flag) is true.
function parseOptions(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[args[i].slice(2)] = true;
    } else {
      opts[args[i].slice(2)] = next;
      i++;
    }
  }
  return opts;
}

function requireId(opts) {
  if (!/^[A-Za-z0-9]{8}$/.test(String(opts.id || ''))) {
    throw { custom: fail('bad-id', 'The --id must be exactly 8 letters or digits.') };
  }
  return opts.id;
}

function fail(code, message, extra) {
  return Object.assign({ ok: false, code: code, error: message }, extra || {});
}

function notesError(e) {
  if (e && e.custom) return e.custom;
  const msg = String((e && e.message) || e);
  if (/-1743|not authori[sz]ed|not allowed/i.test(msg)) {
    return fail('not-authorized', msg, {
      hint: 'Allow control of Notes in System Settings > Privacy & Security > Automation, then try again.',
    });
  }
  return fail('error', msg);
}

// ---------------------------------------------------------------- Notes access

// Folders and notes are looked up by their permanent id, never by position:
// Notes re-sorts notes by last edit, so "the 3rd note" can change mid-run.
function findFolder(Notes) {
  const acct = Notes.defaultAccount();
  const ids = acct.folders.whose({ name: FOLDER_NAME }).id();
  return ids.length ? acct.folders.byId(ids[0]) : null;
}

function createFolder(Notes) {
  const acct = Notes.defaultAccount();
  acct.folders.push(Notes.Folder({ name: FOLDER_NAME }));
  const folder = findFolder(Notes);
  if (!folder) throw { custom: fail('folder-create-failed', 'Could not create the "Claude Notes" folder.') };
  return folder;
}

// A session's note is the one whose title ends with "_<id>".
function findNote(folder, id) {
  // One query returns the matching ids, so nothing can shift in between.
  const ids = folder.notes.whose({ name: { _endsWith: '_' + id } }).id();
  return ids.length ? folder.notes.byId(ids[0]) : null;
}

// ---------------------------------------------------------------- save

function save(id, title, allowAttachmentLoss) {
  const text = readStdin();
  if (!text.trim()) return fail('empty', 'Nothing to save: the entry text is empty.');

  const Notes = Application('Notes');
  let folder = findFolder(Notes);
  let note = folder ? findNote(folder, id) : null;

  const entryHtml = markdownToHtml(text).join('\n') + '\n' +
    '<div><span style="' + GRAY + '">' + timestamp() + '</span></div>\n<div><br></div>';

  let createdFolder = false;
  let createdNote = false;
  let attachmentsBefore = 0;

  if (!note) {
    if (!folder) {
      folder = createFolder(Notes);
      createdFolder = true;
    }
    const noteTitle = makeTitle(title || text, id);
    folder.notes.push(Notes.Note({ body: '<h1>' + escapeHtml(noteTitle) + '</h1>\n' + entryHtml }));
    note = findNote(folder, id);
    if (!note) return fail('note-create-failed', 'The note was not found after creating it.');
    createdNote = true;
  } else {
    attachmentsBefore = note.attachments.length;
    if (attachmentsBefore > 0 && !allowAttachmentLoss) {
      return fail('attachments-would-be-lost',
        'This note has ' + attachmentsBefore + ' picture(s) or attachment(s). Adding text from a script ' +
        'can delete them or leave them broken, so nothing was saved.', { attachments: attachmentsBefore });
    }
    // Notes hands back non-breaking spaces as plain spaces; restore them so code
    // indentation survives. Text typed by hand at the very end must not run into
    // the new entry, so make sure an empty line separates them.
    const existing = note.body().split('\n').map(keepSpaces).join('\n').replace(/\s+$/, '');
    const lastLine = existing.slice(existing.lastIndexOf('\n') + 1);
    const separator = isEmptyLine(lastLine) ? '' : '\n<div><br></div>';
    note.body = existing + separator + '\n' + entryHtml;
  }

  const parsed = parseNote(note.plaintext(), note.body());
  const result = {
    ok: true,
    createdFolder: createdFolder,
    createdNote: createdNote,
    title: note.name(),
    entryCount: parsed.entries.length,
  };
  if (attachmentsBefore > 0) {
    // A count that stays the same does not prove the pictures still display.
    result.attachmentsBefore = attachmentsBefore;
    result.attachmentsAfter = note.attachments.length;
  }
  return result;
}

// Turns leading spaces and double spaces in text (not in tags) back into &nbsp;.
function keepSpaces(line) {
  let first = true;
  return line.split(/(<[^>]*>)/).map(part => {
    if (!part || part.startsWith('<')) return part;
    let t = part;
    if (first) t = t.replace(/^ +/, m => '&nbsp;'.repeat(m.length));
    first = false;
    return t.replace(/ {2}/g, ' &nbsp;');
  }).join('');
}

function isEmptyLine(line) {
  return /^\s*<div[^>]*>/.test(line) && !/<img\b/.test(line) && htmlText(line) === '';
}

function makeTitle(title, id) {
  let t = String(title).split('\n')[0]
    .replace(/[_\/\\:]+/g, ' ')
    .replace(/[`*#>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 60) t = t.slice(0, 60).trim();
  if (!t) t = 'Note';
  return localDate() + '_' + t + '_' + id;
}

// ---------------------------------------------------------------- read

function read(id) {
  const Notes = Application('Notes');
  const folder = findFolder(Notes);
  if (!folder) return { ok: true, found: false, reason: 'no-folder' };
  const note = findNote(folder, id);
  if (!note) return { ok: true, found: false, reason: 'no-note' };

  const parsed = parseNote(note.plaintext(), note.body());
  const labels = [];
  parsed.entries.forEach(e => {
    if (e.label && labels.indexOf(e.label) === -1) labels.push(e.label);
  });
  return {
    ok: true,
    found: true,
    title: note.name(),
    entryCount: parsed.entries.length,
    labels: labels,
    attachments: note.attachments.length,
    entries: parsed.entries,
  };
}

// Splits the note's plain text into entries:
//   - a line with a time stamp ends a saved entry;
//   - an empty line ends an entry typed by hand (saved entries contain no empty
//     lines; their blank lines hold a single space).
// The note's HTML is used to put list bullets back and to spot code lines.
function parseNote(plaintext, bodyHtml) {
  const lines = annotateLines(String(plaintext).replace(/\r\n?/g, '\n').split('\n'), bodyHtml);
  const title = lines.shift();
  const entries = [];
  let cur = null;

  const finish = () => {
    if (cur && cur.lines.some(l => l.text.trim())) entries.push(finalize(cur, entries.length + 1));
    cur = null;
  };

  lines.forEach(line => {
    const trimmed = line.text.trim();
    if (!line.code && STAMP_RE.test(trimmed)) {
      (cur || (cur = { lines: [] })).time = trimmed;
      finish();
    } else if (line.text === '') {
      finish();
    } else {
      (cur || (cur = { lines: [] })).lines.push(line);
    }
  });
  finish();
  return { title: title ? title.text : '', entries: entries };
}

// Notes' plain text drops bullets, numbers and fonts. Its HTML has one line per
// plain-text line (plus <ul>/<ol> wrapper lines), so when the two line up we add
// "- " / "1. " back and mark lines set in a monospace font as code. If they don't
// line up, the plain text is used as it is.
function annotateLines(plainLines, bodyHtml) {
  const info = [];
  const stack = [];
  String(bodyHtml || '').split('\n').forEach(raw => {
    const l = raw.trim();
    const open = l.match(/^<(ul|ol)\b[^>]*>$/);
    if (open) {
      stack.push({ tag: open[1], count: 0 });
    } else if (/^<\/(ul|ol)>$/.test(l)) {
      stack.pop();
    } else if (/^<li\b/.test(l) && stack.length) {
      const top = stack[stack.length - 1];
      top.count++;
      info.push({ prefix: '  '.repeat(stack.length - 1) + (top.tag === 'ol' ? top.count + '. ' : '- '), code: false });
    } else {
      const mono = MONOSPACE_FONT_RE.test(l);
      MONOSPACE_FONT_RE.lastIndex = 0;
      const code = mono && htmlText(l.replace(MONOSPACE_FONT_RE, '')).trim() === '';
      info.push({ prefix: '', code: code });
    }
  });
  const aligned = info.length === plainLines.length;
  return plainLines.map((t, i) => {
    const text = t.replace(/\u00a0/g, ' ');
    return aligned ? { text: info[i].prefix + text, code: info[i].code } : { text: text, code: false };
  });
}

// Builds one entry. Runs of code lines become fenced code blocks; a block that
// starts like a Mermaid diagram is fenced as ```mermaid and listed in `diagrams`.
function finalize(cur, n) {
  const out = [];
  const diagrams = [];
  let block = null;
  const closeBlock = () => {
    if (!block) return;
    const source = block.join('\n');
    const firstReal = block.find(l => l.trim() && !/^\s*%%/.test(l)) || '';
    const isMermaid = MERMAID_START_RE.test(firstReal);
    if (isMermaid) diagrams.push({ source: source });
    out.push((isMermaid ? '```mermaid' : '```') + '\n' + source + '\n```');
    block = null;
  };
  cur.lines.forEach(line => {
    if (line.code) {
      (block || (block = [])).push(line.text.trim() === '' ? '' : line.text);
    } else {
      closeBlock();
      out.push(line.text.trim() === '' ? '' : line.text);
    }
  });
  closeBlock();

  let text = out.join('\n').replace(/^\s+|\s+$/g, '');
  let label = null;
  const m = text.match(/^\[([^\]\n]+)\]\s*/);
  if (m) {
    label = m[1].trim();
    text = text.slice(m[0].length);
  }
  const attachments = text.split(OBJECT_CHAR).length - 1;
  text = text.split(OBJECT_CHAR).join('[picture or attachment]');
  return {
    n: n,
    label: label,
    text: text,
    time: cur.time || null,
    savedByNote: Boolean(cur.time),
    diagrams: diagrams,
    attachments: attachments,
  };
}

// ---------------------------------------------------------------- Markdown -> Notes HTML

function markdownToHtml(md) {
  const out = [];
  const lists = []; // stack of { indent, tag }
  let lines = md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');

  // "[Label] ```mermaid" on the first line: keep the label as its own line.
  const first = lines[0].match(/^\s*(\[[^\]]+\])\s*((`{3,}|~{3,}).*)$/);
  if (first) lines = [first[1], first[2]].concat(lines.slice(1));

  const closeLists = (indent) => {
    while (lists.length && lists[lists.length - 1].indent > indent) out.push('</' + lists.pop().tag + '>');
  };

  let blankPending = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A blank line becomes a spacer line holding one space: it looks empty in Notes
    // but does not split the entry, and keeps two lists from merging.
    if (!line.trim()) {
      closeLists(-1);
      blankPending = out.length > 0;
      continue;
    }
    if (blankPending) {
      out.push('<div>&nbsp;</div>');
      blankPending = false;
    }

    // Fenced code (Mermaid included) is kept as code, in a monospace font.
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      closeLists(-1);
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) out.push(codeLine(lines[i++]));
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      closeLists(-1);
      out.push('<div>──────────</div>');
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      closeLists(-1);
      const level = heading[1].length;
      out.push(level <= 3
        ? '<h' + level + '>' + inline(heading[2]) + '</h' + level + '>'
        : '<div><b>' + inline(heading[2]) + '</b></div>');
      continue;
    }

    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      const indent = item[1].length;
      const tag = /\d/.test(item[2]) ? 'ol' : 'ul';
      closeLists(indent);
      const top = lists[lists.length - 1];
      if (top && top.indent === indent && top.tag !== tag) out.push('</' + lists.pop().tag + '>');
      const now = lists[lists.length - 1];
      if (!now || now.indent < indent) {
        lists.push({ indent: indent, tag: tag });
        out.push('<' + tag + '>');
      }
      out.push('<li>' + inline(item[3]) + '</li>');
      continue;
    }

    closeLists(-1);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      // Notes drops <blockquote> from scripted HTML, so a quote is shown in italics.
      out.push('<div><i>' + (inline(quote[1]) || '&nbsp;') + '</i></div>');
      continue;
    }
    out.push('<div>' + inline(line) + '</div>');
  }
  closeLists(-1);
  return out;
}

// Code is shown in a monospace font. Blank code lines get a non-breaking space so
// they never look like the empty line that separates entries.
function codeLine(line) {
  const html = escapeHtml(line).replace(/^ +/, m => '&nbsp;'.repeat(m.length)).replace(/ {2}/g, ' &nbsp;');
  return '<div><tt>' + (html || '&nbsp;') + '</tt></div>';
}

function inline(s) {
  const codes = [];
  let t = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });
  t = escapeHtml(t);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)"]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<b>$1</b>');
  t = t.replace(/__(?=\S)(.+?)(?<=\S)__/g, '<b>$1</b>');
  t = t.replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?![*\w])/g, '$1<i>$2</i>');
  t = t.replace(/(^|[^_\w])_(?=\S)(.+?)(?<=\S)_(?![_\w])/g, '$1<i>$2</i>');
  t = t.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<strike>$1</strike>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, k) => '<tt>' + escapeHtml(codes[Number(k)]) + '</tt>');
}

// ---------------------------------------------------------------- small helpers

function readStdin() {
  ObjC.import('Foundation');
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
  return str.isNil() ? '' : str.js;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Notes writes entities with or without the closing ";" (e.g. "&quot" and "&gt").
function htmlText(html) {
  return String(html).replace(/<[^>]*>/g, '')
    .replace(/&nbsp;?/g, '\u00a0').replace(/&lt;?/g, '<').replace(/&gt;?/g, '>')
    .replace(/&quot;?/g, '"').replace(/&#0*39;?/g, "'").replace(/&amp;?/g, '&');
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function localDate() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function timestamp() {
  const d = new Date();
  return localDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
