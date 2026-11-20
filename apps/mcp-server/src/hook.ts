import { relative, isAbsolute } from 'node:path';
import type { GitAlert, TeamContext } from '@devsync/sdk';
import { callBridge, type BridgeError } from '@devsync/sdk/bridge-ipc';
import { formatContext, formatOverlapWarning } from './format';
import { PLUGIN_VERSION } from './version';

/**
 * Claude Code hook handler (one process per hook event). It only sends technical facts to the local
 * Bridge — session lifecycle, declared state, paths of edited files — never prompts, file contents,
 * command lines or model reasoning. It must be fast and must never break the session: always exit 0.
 */
interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
}

const TIMEOUT_MS = 2000;
const MAX_CONTEXT_CHARS = 6000;
/** Appended after truncation so it is always present, whether or not the team-first skill gets loaded. */
const TEAM_HINT = [
  '## Before working alone',
  'Before a significant task (researching a topic, designing an API or data model, changing a shared or core',
  'file, or needing something another part of the team owns), check the team first: `team_search_knowledge`, then',
  "`team_find_expert` with the topic in a few keywords (try the developer's words and their English equivalents).",
  'If someone matches or a teammate is working on it, tell the developer who and why, and offer to ask them',
  '(`team_create_request`, or `team_suggest_collaboration` when unsure) instead of guessing. Skip it for small,',
  'local changes.',
  '',
  '## Leave something reusable',
  'When you finish a significant piece of work in this session (project understanding, analysis, decision,',
  'solution, API contract, brainstorm), end your answer by offering in one sentence to save a synthesis:',
  'shared with the project team (skill `dev:share`) or private for the developer (skill `dev:keep`).',
  'If the developer accepts, run that skill. Never publish without their explicit choice. Do not offer it',
  'for small or routine changes, and do not offer it again for the same result.',
].join('\n');
const EDIT_TOOLS: Record<string, string> = {
  Edit: 'Edited',
  MultiEdit: 'Edited',
  Write: 'Wrote',
  NotebookEdit: 'Edited notebook',
};

const bridge = <T>(method: string, params: unknown) =>
  callBridge<T>(method, params, { timeoutMs: TIMEOUT_MS });

async function readStdin(): Promise<HookInput> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data || '{}') as HookInput;
  } catch {
    return {};
  }
}

/** Registers the session if the daemon does not know it (daemon restarted, hook ordering). */
async function withSession(input: HookInput, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    if (!(error as Error).message?.startsWith('Unknown session')) throw error;
    await bridge('session.start', {
      externalSessionId: input.session_id,
      workingDirectory: input.cwd,
      pluginVersion: PLUGIN_VERSION,
    });
    await fn();
  }
}

export async function handleHook(event: string, input: HookInput): Promise<string | null> {
  const sessionId = input.session_id;
  if (!sessionId || !input.cwd) return null;
  const update = (state: object) =>
    withSession(input, () => bridge('session.update', { externalSessionId: sessionId, ...state }));

  switch (event) {
    case 'SessionStart': {
      try {
        await bridge('session.start', {
          externalSessionId: sessionId,
          workingDirectory: input.cwd,
          pluginVersion: PLUGIN_VERSION,
        });
        const context = await bridge<TeamContext>('api.call', {
          operation: 'context',
          params: {},
          workingDirectory: input.cwd,
        });
        let text = formatContext(context);
        if (text.length > MAX_CONTEXT_CHARS)
          text = `${text.slice(0, MAX_CONTEXT_CHARS)}\n… (truncated — call team_get_context for details)`;
        text = `${text}\n\n${TEAM_HINT}`;
        return JSON.stringify({
          hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
        });
      } catch (error) {
        if ((error as BridgeError).unavailable) {
          return JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext:
                'DevSync: the Bridge daemon is not running on this machine, team features are unavailable (`devsync start`).',
            },
          });
        }
        return null;
      }
    }
    case 'UserPromptSubmit':
      await update({ status: 'WORKING' });
      return null;
    case 'PostToolUse': {
      const verb = input.tool_name ? EDIT_TOOLS[input.tool_name] : undefined;
      const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
      if (!verb || !path) return null;
      const rel = isAbsolute(path) ? relative(input.cwd, path) : path;
      if (rel.startsWith('..')) return null; // outside the project: not team-relevant
      await withSession(input, () =>
        bridge('activity.publish', {
          externalSessionId: sessionId,
          kind: 'tool_used',
          summary: `${verb} ${rel}`,
          tool: input.tool_name,
        }),
      );
      // Real-time overlap warning: another agent is changing the same file (or the same lines).
      try {
        const { warnings } = await callBridge<{ warnings: GitAlert[] }>(
          'git.afterEdit',
          { workingDirectory: input.cwd, externalSessionId: sessionId, file: rel },
          { timeoutMs: 8000 },
        );
        if (warnings.length) {
          return JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PostToolUse',
              additionalContext: formatOverlapWarning(rel, warnings),
            },
          });
        }
      } catch {
        /* no warning rather than a slow or failing hook */
      }
      return null;
    }
    case 'Notification':
      await update({ status: 'WAITING' });
      return null;
    case 'Stop':
      await update({ status: 'IDLE' });
      return null;
    case 'SessionEnd':
      await bridge('session.end', { externalSessionId: sessionId });
      return null;
    default:
      return null;
  }
}

async function main() {
  const input = await readStdin();
  const event = process.argv[2] ?? input.hook_event_name ?? '';
  try {
    const output = await handleHook(event, input);
    if (output) process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`devsync hook ${event}: ${(error as Error).message}\n`);
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('hook.mjs')) void main();
