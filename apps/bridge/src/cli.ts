#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { openSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, platform, release } from 'node:os';
import { parseArgs } from 'node:util';
import { DevSyncApiError, DevSyncClient, type InboxItem } from '@devsync/sdk';
import {
  bridgePaths,
  clearCredentials,
  loadConfig,
  loadToken,
  saveConfig,
  saveToken,
} from './config';
import { runDaemon } from './daemon/daemon';
import { ipcCall } from './daemon/ipc';
import { BRIDGE_VERSION } from './version';

const paths = bridgePaths();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out = (line = '') => process.stdout.write(`${line}\n`);

function openBrowser(url: string) {
  const command =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'explorer.exe' : 'xdg-open';
  execFile(command, [url], () => undefined);
}

async function login(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      server: { type: 'string' },
      name: { type: 'string' },
      'no-browser': { type: 'boolean' },
    },
  });
  const config = await loadConfig(paths);
  const serverUrl = (values.server ?? config.serverUrl).replace(/\/+$/, '');
  const api = new DevSyncClient({ baseUrl: serverUrl });
  const auth = await api.authorizeDevice({
    machineName: values.name ?? hostname(),
    hostname: hostname(),
    os: `${platform()} ${release()}`,
    bridgeVersion: BRIDGE_VERSION,
  });

  out(
    `To connect this machine, open:\n\n  ${auth.verificationUri}\n\nand enter the code:\n\n  ${auth.userCode}\n`,
  );
  if (!values['no-browser']) openBrowser(auth.verificationUriComplete);

  const deadline = Date.now() + auth.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(auth.interval * 1000);
    let result;
    try {
      result = await api.exchangeDeviceCode(auth.deviceCode);
    } catch (error) {
      // Network blips (server restart, Wi-Fi) must not abort the login: keep polling until expiry.
      if (error instanceof DevSyncApiError && error.status !== 429 && error.status < 500)
        throw error;
      continue;
    }
    if (result.status === 'pending') continue;
    if (result.status === 'denied') throw new Error('The request was denied in the browser.');
    await saveToken(paths, result.deviceToken);
    const me = await new DevSyncClient({ baseUrl: serverUrl, token: result.deviceToken }).whoami();
    await saveConfig(paths, {
      serverUrl,
      machineId: me.machine.id,
      teamId: me.team.id,
      teamSlug: me.team.slug,
      userId: me.user.id,
      userEmail: me.user.email,
    });
    out(`✔ ${me.machine.name} is connected to team "${me.team.name}" as ${me.user.email}.`);
    out('  Start the background service with: devsync start');
    return;
  }
  throw new Error('The code expired. Run `devsync login` again.');
}

async function status() {
  const config = await loadConfig(paths);
  const token = await loadToken(paths);
  out(`Server:  ${config.serverUrl}`);
  if (!token) return out('Machine: not paired (run `devsync login`)');
  try {
    const me = await new DevSyncClient({ baseUrl: config.serverUrl, token }).whoami();
    out(`Team:    ${me.team.name} (${me.team.slug})`);
    out(`User:    ${me.user.name} <${me.user.email}>`);
    out(`Machine: ${me.machine.name}`);
  } catch (error) {
    out(
      `Machine: ${error instanceof DevSyncApiError && error.status === 401 ? 'token revoked — run `devsync login`' : 'server unreachable'}`,
    );
  }
  try {
    const daemon = await ipcCall<{
      realtime: string;
      sessions: { externalSessionId: string; status?: string; currentTask?: string }[];
      pendingOutbox: number;
    }>(paths.socket, 'status');
    out(
      `Daemon:  running, realtime ${daemon.realtime}, ${daemon.sessions.length} session(s), ${daemon.pendingOutbox} queued`,
    );
    for (const s of daemon.sessions)
      out(
        `  - ${s.externalSessionId} ${s.status ?? ''} ${s.currentTask ? `· ${s.currentTask}` : ''}`,
      );
  } catch {
    out('Daemon:  not running (devsync start)');
  }
}

function formatInbox(items: InboxItem[]) {
  if (items.length === 0) return out('Inbox is empty.');
  for (const item of items) {
    const from = item.initiatorAgent
      ? `${item.createdBy.name}'s agent ${item.initiatorAgent.name}`
      : item.createdBy.name;
    out(`${item.priority.padEnd(7)} ${item.status.padEnd(26)} ${item.title}`);
    out(`        ${item.type.toLowerCase()} · ${item.project.name} · from ${from} · ${item.id}`);
  }
}

async function inbox() {
  const config = await loadConfig(paths);
  const token = await loadToken(paths);
  if (!token) throw new Error('This machine is not paired. Run `devsync login` first.');
  formatInbox((await new DevSyncClient({ baseUrl: config.serverUrl, token }).inbox()).items);
}

async function start() {
  try {
    await ipcCall(paths.socket, 'status', undefined, 1000);
    return out('DevSync daemon is already running.');
  } catch {
    /* not running */
  }
  const log = openSync(paths.log, 'a');
  const child = spawn(process.execPath, [process.argv[1]!, 'daemon'], {
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  await writeFile(paths.pid, String(child.pid), { mode: 0o600 });
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    try {
      await ipcCall(paths.socket, 'status', undefined, 500);
      return out(`✔ DevSync daemon started (pid ${child.pid}). Logs: ${paths.log}`);
    } catch {
      /* starting */
    }
  }
  throw new Error(`The daemon did not start. See ${paths.log}`);
}

async function stop() {
  const pid = Number(await readFile(paths.pid, 'utf8').catch(() => ''));
  if (!pid) return out('DevSync daemon is not running.');
  try {
    process.kill(pid, 'SIGTERM');
    out('✔ DevSync daemon stopped.');
  } catch {
    out('DevSync daemon was not running.');
  }
  await rm(paths.pid, { force: true });
}

async function daemon() {
  const running = await runDaemon(paths);
  const shutdown = async () => {
    await running.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

const HELP = `devsync ${BRIDGE_VERSION} — DevSync AI Bridge

Usage:
  devsync login [--server URL] [--name NAME]   Pair this machine with a team
  devsync status                               Show pairing, daemon and sessions
  devsync inbox                                Requests waiting for you or your agents
  devsync start | stop                         Run the background daemon
  devsync daemon                               Run the daemon in the foreground
  devsync notify-test                          Show a test desktop notification
  devsync logout                               Forget this machine's credentials`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'login':
      return login(args);
    case 'logout':
      await stop().catch(() => undefined);
      await clearCredentials(paths);
      return out(
        '✔ Credentials removed. Revoke the machine from Settings → Machines to invalidate the token server-side.',
      );
    case 'status':
      return status();
    case 'inbox':
      return inbox();
    case 'start':
      return start();
    case 'stop':
      return stop();
    case 'daemon':
      return daemon();
    case 'notify-test':
      return void (await ipcCall(paths.socket, 'notify.test'));
    case 'version':
    case '--version':
      return out(BRIDGE_VERSION);
    default:
      return out(HELP);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`✖ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
