import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { readConversation } from './transcript.mjs';

const conversationIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const runFile = promisify(execFile);

export async function chooseWindowsDestination(filename, directory) {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const source = readFileSync(new URL('./save-dialog.ps1', import.meta.url), 'utf8');
  const command = Buffer.from(source, 'utf16le').toString('base64');
  const { stdout } = await runFile(powershell, ['-NoProfile', '-NonInteractive', '-Sta', '-EncodedCommand', command], {
    windowsHide: true,
    env: {
      ...process.env,
      AGY_EXPORT_SUGGESTED_NAME: filename,
      AGY_EXPORT_INITIAL_DIRECTORY: directory,
    },
  });
  const selection = stdout.trim();
  return selection ? Buffer.from(selection, 'base64').toString('utf8') : null;
}

export function registerRoutes(app, { dataRoot, outputDir, chooseDestination = chooseWindowsDestination }) {
  let lastDirectory = outputDir;
  let dialogOpen = false;
  app.page('/', () => page);
  app.api('/api/export', async (body) => {
    const id = body?.conversationId || app.config?.conversationId;
    if (typeof id !== 'string' || !conversationIdPattern.test(id)) {
      return { error: '请在要导出的对话中重新打开此面板。' };
    }
    let transcript;
    try {
      transcript = await readConversation(dataRoot, id);
    } catch (error) {
      return { error: error.message };
    }

    const { messages, unreadable, title } = transcript;
    const heading = title.replace(/[\\`*_~<>\[\]#]/g, '\\$&');
    const sections = messages.map(({ role, text }) =>
      `## ${role === 'user' ? '用户' : 'Antigravity'}\n\n${text.trimEnd()}`);
    const markdown = [`# ${heading}`, `会话 ID：${id}`, ...sections].join('\n\n') + '\n';
    const slug = Array.from(title.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_')).slice(0, 48).join('').trim() || '对话';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const suffix = randomUUID().slice(0, 8);
    const filename = `${stamp}_${slug}_${suffix}.md`;
    const custom = body?.destination === 'choose';
    let path = join(outputDir, filename);
    if (custom) {
      if (dialogOpen) return { error: '另存为窗口已打开，请先完成选择。' };
      dialogOpen = true;
      try {
        path = await chooseDestination(filename, lastDirectory);
      } catch {
        return { error: '无法打开「另存为」窗口。可重试或保存到桌面。' };
      } finally {
        dialogOpen = false;
      }
      if (path === null) return { cancelled: true };
      if (!isAbsolute(path) || extname(path).toLowerCase() !== '.md') {
        return { error: '请选择以 .md 结尾的文件名。' };
      }
    }
    const directory = dirname(path);
    const temp = join(directory, `.agy-export-${randomUUID()}.tmp`);
    try {
      if (!custom) await mkdir(outputDir, { recursive: true });
      await writeFile(temp, markdown, { encoding: 'utf8', flag: 'wx' });
      await rename(temp, path);
    } catch {
      await rm(temp, { force: true }).catch(() => {});
      return { error: '写入失败。请检查保存位置的访问权限和可用空间。' };
    }
    if (custom) lastDirectory = directory;
    return { path, count: messages.length, unreadable };
  }, 'POST');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN?.trim()) {
    console.error('Antigravity did not provide a sidecar UI token.');
  } else {
    const { SidecarApp } = await import('sidecar_sdk');
    const app = new SidecarApp();
    const geminiRoot = process.env.ANTIGRAVITY_GEMINI_DIR || join(homedir(), '.gemini');
    registerRoutes(app, {
      dataRoot: join(geminiRoot, 'antigravity'),
      outputDir: join(homedir(), 'Desktop', 'Antigravity_Exports'),
    });
    await app.run();
  }
}
