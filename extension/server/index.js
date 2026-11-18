#!/usr/bin/env node
// Note It Down! - Claude Desktop extension.
//
// A small MCP server (JSON-RPC over stdio, no dependencies) that gives regular
// Claude chat two tools, note_save and note_read. Each call runs the same helper
// the Claude Code plugin uses, note.js, with macOS's built-in osascript:
//
//   /usr/bin/osascript -l JavaScript note.js save|read --id <id> ...
//
// It runs no other programs, opens no network connections and writes no files.

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = '0.2.5';
// In the packed .mcpb, note.js sits next to this file. When run straight from a
// checkout of the repo, use the skill's copy instead.
const NOTE_JS = [
  path.join(__dirname, 'note.js'),
  path.join(__dirname, '..', '..', 'skills', 'note', 'scripts', 'note.js'),
].find(p => fs.existsSync(p));
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Note It Down! saves chat notes to Apple Notes. Use these tools only for messages containing ' +
  'the literal token "/note": a message that STARTS with "/note <text>" is a save (note_save, text ' +
  'passed verbatim); a bare "/note" or "/note" elsewhere in the message is a read (note_read). ' +
  'Never save without "/note" at the start. Follow the note-it-down skill for the details.';

const NOTE_ID = {
  type: 'string',
  description: 'The 8-character ID of this conversation\'s note. Make up a random one (lowercase ' +
    'letters and digits) on the first save in a conversation and reuse it for every later call.',
};

const TOOLS = [
  {
    name: 'note_save',
    title: 'Save to Apple Notes',
    description: 'Appends an entry to this conversation\'s note in the "Claude Notes" folder of Apple ' +
      'Notes, creating the folder and note on the first save. Call it only when the user\'s message ' +
      'starts with "/note" followed by text, and pass that text exactly as typed. If the note holds ' +
      'pictures or attachments, it saves nothing and reports how many; ask the user, and only after ' +
      'they say yes call again with allow_attachment_loss set to true.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: NOTE_ID,
        title: {
          type: 'string',
          description: '2-6 plain words from this entry, without the label. Used only when the note is created.',
        },
        text: {
          type: 'string',
          description: 'The user\'s text after the leading "/note", verbatim (labels, Markdown and code included).',
        },
        allow_attachment_loss: {
          type: 'boolean',
          description: 'Only true after the user explicitly agreed, for this save, that pictures or ' +
            'attachments in the note will be removed. Never set it on your own.',
        },
      },
      required: ['note_id', 'title', 'text'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'note_read',
    title: 'Read from Apple Notes',
    description: 'Reads this conversation\'s note from the "Claude Notes" folder and returns its entries ' +
      '(label, text, time stamp, Mermaid sources). Never creates anything. Call it for a bare "/note" ' +
      'or when "/note" appears anywhere other than the start of the user\'s message.',
    inputSchema: {
      type: 'object',
      properties: { note_id: NOTE_ID },
      required: ['note_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// ---------------------------------------------------------------- tools

async function callTool(name, rawArgs) {
  const args = normalizeArgs(rawArgs);
  logCall(name, rawArgs, args);
  const noteId = String(args.note_id === undefined || args.note_id === null ? '' : args.note_id).trim();
  if (!/^[A-Za-z0-9]{8}$/.test(noteId)) {
    return toolResult({
      ok: false,
      code: 'bad-id',
      error: 'note_id must be exactly 8 letters or digits.',
      received: describeArgs(rawArgs),
    });
  }
  if (name === 'note_read') {
    return toolResult(await runHelper(['read', '--id', noteId], ''));
  }
  if (name === 'note_save') {
    if (typeof args.text !== 'string' || !args.text.trim()) {
      return toolResult({ ok: false, code: 'empty', error: 'Nothing to save: the text is empty.' });
    }
    const helperArgs = ['save', '--id', noteId, '--title', String(args.title || '')];
    if (args.allow_attachment_loss === true || args.allow_attachment_loss === 'true') {
      helperArgs.push('--allow-attachment-loss');
    }
    return toolResult(await runHelper(helperArgs, args.text));
  }
  return toolResult({ ok: false, code: 'unknown-tool', error: 'Unknown tool: ' + name });
}

// Clients don't all send tool arguments the same way: some send a JSON string
// instead of an object, or camelCase names. Accept those shapes.
function normalizeArgs(raw) {
  let args = raw;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch (e) {
      args = {};
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  const out = Object.assign({}, args);
  // note_id used to be called session_id. Some chat relays drop an argument named
  // session_id, which is why it was renamed; the old names are still accepted.
  const aliases = {
    noteId: 'note_id', session_id: 'note_id', sessionId: 'note_id', id: 'note_id',
    allowAttachmentLoss: 'allow_attachment_loss',
  };
  Object.keys(aliases).forEach(alias => {
    if (out[aliases[alias]] === undefined && out[alias] !== undefined) out[aliases[alias]] = out[alias];
  });
  return out;
}

// The shape of the arguments (names, types, lengths), never their text.
function describeArgs(raw) {
  if (typeof raw === 'string') return 'a string of ' + raw.length + ' characters';
  if (!raw || typeof raw !== 'object') return String(raw);
  return Object.keys(raw).map(k => {
    const v = raw[k];
    if (/^(note_?id|noteId|session_?id|sessionId|id)$/.test(k)) return k + '=' + JSON.stringify(v);
    return k + ':' + (typeof v === 'string' ? 'string(' + v.length + ')' : typeof v);
  }).join(', ') || '(no arguments)';
}

// Goes to stderr, which Claude Desktop writes to its log for this extension
// (~/Library/Logs/Claude/mcp-server-Note It Down!.log).
function logCall(name, raw, args) {
  process.stderr.write('[note-it-down] tools/call ' + name + ' raw=' + describeArgs(raw) +
    (raw === args ? '' : ' normalized=' + describeArgs(args)) + '\n');
}

function toolResult(result) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: result.ok === false,
  };
}

// Runs note.js and returns its JSON output. The text goes in on stdin, so it is
// never interpreted by a shell.
function runHelper(args, input) {
  return new Promise(resolve => {
    if (process.platform !== 'darwin') {
      resolve({ ok: false, code: 'not-macos', error: 'Apple Notes is only available on macOS.' });
      return;
    }
    const child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', NOTE_JS].concat(args), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => resolve({ ok: false, code: 'error', error: e.message }));
    child.on('close', code => {
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        const message = (err || out || 'osascript exited with code ' + code).trim();
        const denied = /-1743|not authori[sz]ed|not allowed/i.test(message);
        resolve({
          ok: false,
          code: denied ? 'not-authorized' : 'error',
          error: message,
          hint: denied ? 'Allow control of Notes in System Settings > Privacy & Security > Automation.' : undefined,
        });
      }
    });
    child.stdin.end(input, 'utf8');
  });
}

// ---------------------------------------------------------------- MCP over stdio

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id: id, result: result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } });
}

async function handle(message) {
  const id = message.id;
  const params = message.params || {};
  if (id === undefined || id === null) return; // notifications need no answer

  try {
    switch (message.method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        reply(id, {
          protocolVersion: SUPPORTED_PROTOCOLS.indexOf(asked) !== -1 ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'note-it-down', title: 'Note It Down!', version: VERSION },
          instructions: INSTRUCTIONS,
        });
        return;
      }
      case 'ping':
        reply(id, {});
        return;
      case 'tools/list':
        reply(id, { tools: TOOLS });
        return;
      case 'tools/call':
        reply(id, await callTool(params.name, params.arguments || {}));
        return;
      default:
        replyError(id, -32601, 'Method not found: ' + message.method);
    }
  } catch (e) {
    replyError(id, -32603, String((e && e.message) || e));
  }
}

readline.createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (e) {
    replyError(null, -32700, 'Parse error');
    return;
  }
  handle(message);
});
