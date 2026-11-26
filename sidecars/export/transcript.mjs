import { createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function protobufFields(bytes) {
  const fields = new Map();
  let offset = 0;

  function varint() {
    let value = 0;
    for (let shift = 0; shift <= 63 && offset < bytes.length; shift += 7) {
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
    }
    throw new Error('Truncated protobuf varint');
  }

  while (offset < bytes.length) {
    const tag = varint();
    const wire = tag % 8;
    if (wire === 0) {
      varint();
      continue;
    }
    if (wire === 1 || wire === 5) {
      offset += wire === 1 ? 8 : 4;
      continue;
    }
    if (wire !== 2) break;
    const length = varint();
    if (length > bytes.length - offset) throw new Error('Truncated protobuf field');
    const field = Math.floor(tag / 8);
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  return fields;
}

const utf8 = new TextDecoder();

// The saved trajectory stores user input in field 19 and planner replies in field 20.
function decodeStep(payload, user) {
  for (const message of protobufFields(payload).get(user ? 19 : 20) ?? []) {
    const fields = protobufFields(message);
    if (!user) {
      const text = fields.get(1)?.[0] ?? fields.get(8)?.[0];
      if (text?.length) return utf8.decode(text);
      continue;
    }
    const text = fields.get(2)?.[0];
    if (text?.length) return utf8.decode(text);
    const prompt = fields.get(3)?.[0];
    if (prompt?.length) {
      const nested = protobufFields(prompt).get(1)?.[0];
      if (nested?.length) return utf8.decode(nested);
    }
  }
  return '';
}

function userText(value) {
  return value.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/)?.[1]
    ?? value.replace(/<(ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|EPHEMERAL_MESSAGE)>[\s\S]*?<\/\1>/g, '');
}

function readOnly(file, query) {
  function run(path) {
    const db = new DatabaseSync(path, { readOnly: true, timeout: 1500 });
    try {
      return query(db);
    } finally {
      db.close();
    }
  }

  try {
    return run(file);
  } catch (error) {
    // A closed WAL database can need to create a shared-memory file just to
    // read it. Its checkpoint is safe to open directly when the WAL is empty.
    const walHasFrames = () => (statSync(file + '-wal', { throwIfNoEntry: false })?.size ?? 0) > 32;
    if (error.errcode !== 14 || walHasFrames()) throw error;
    const snapshot = run(pathToFileURL(file).href + '?mode=ro&immutable=1');
    if (walHasFrames()) return run(file);
    return snapshot;
  }
}

function readDatabase(file) {
  return readOnly(file, (db) => {
    const messages = [];
    let unreadable = 0;
    const rows = db.prepare(`
      SELECT step_type, step_payload
      FROM steps
      WHERE step_type IN (14, 15) AND length(step_payload) > 0
      ORDER BY idx
    `).iterate();
    for (const { step_type: type, step_payload: payload } of rows) {
      const role = type === 14 ? 'user' : 'assistant';
      try {
        const decoded = decodeStep(payload, role === 'user');
        const text = role === 'user' ? userText(decoded) : decoded;
        if (text.trim()) messages.push({ role, text });
      } catch {
        unreadable++;
      }
    }
    return { messages, unreadable };
  });
}

async function readLog(file) {
  const input = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const messages = [];
  try {
    for await (const line of lines) {
      let step;
      try {
        step = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof step?.content !== 'string') continue;
      const user = step.type === 'USER_INPUT' && step.source === 'USER_EXPLICIT';
      const assistant = step.type === 'PLANNER_RESPONSE' && step.source === 'MODEL';
      if (!user && !assistant) continue;
      const text = user ? userText(step.content) : step.content;
      if (text.trim()) messages.push({ role: user ? 'user' : 'assistant', text });
    }
    return { messages, unreadable: 0 };
  } finally {
    lines.close();
    input.destroy();
  }
}

function readTitle(root, id) {
  try {
    return readOnly(join(root, 'conversation_summaries.db'), (db) =>
      db.prepare('SELECT title FROM conversation_summaries WHERE conversation_id = ?').get(id)?.title);
  } catch {
    return '';
  }
}

export async function readConversation(root, id) {
  const database = join(root, 'conversations', id + '.db');
  const logs = join(root, 'brain', id, '.system_generated', 'logs');
  let transcript;
  let databaseError;
  try {
    transcript = readDatabase(database);
  } catch (error) {
    databaseError = error;
  }

  // The transcript can contain turns compacted out of the saved trajectory.
  for (const name of ['transcript_full.jsonl', 'transcript.jsonl']) {
    const log = await readLog(join(logs, name)).catch(() => null);
    if (log && log.messages.length > (transcript?.messages.length ?? 0)) transcript = log;
  }

  if (!transcript?.messages.length) {
    if (databaseError && databaseError.errcode !== 14) {
      throw new Error('本地会话暂时无法读取，请稍后重试。');
    }
    throw new Error('没有可导出的本地消息。请打开已有消息的本地对话后重试。');
  }
  const firstMessage = transcript.messages.find(({ role }) => role === 'user')?.text.trim();
  const title = readTitle(root, id) || firstMessage || 'Antigravity 对话';
  return { ...transcript, title: Array.from(title.split(/\r?\n/, 1)[0].trim()).slice(0, 80).join('') };
}
