import type { ActivityEntry, ClaimInfo, Expert, InboxItem, TeamContext } from '@devsync/sdk';

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

/** Compact markdown, sized for a model context window. */
export function formatInbox(items: InboxItem[]): string {
  if (items.length === 0) return 'No open request for you or your agents.';
  return items
    .map(
      (i) =>
        `- [${i.priority}] ${i.title} — ${i.type.toLowerCase()}, ${i.status.toLowerCase().replace(/_/g, ' ')}, project ${i.project.name}, from ${i.initiatorAgent ? `${i.createdBy.name}'s agent` : i.createdBy.name} (id ${i.id})`,
    )
    .join('\n');
}

export function formatActivity(items: ActivityEntry[]): string {
  if (items.length === 0) return 'No recent activity.';
  return items
    .map((a) => `- ${ago(a.at)} · ${a.who}${a.project ? ` · ${a.project}` : ''}: ${a.summary}`)
    .join('\n');
}

export function formatClaims(claims: ClaimInfo[]): string {
  if (claims.length === 0) return 'No claimed resource.';
  return claims
    .map(
      (c) =>
        `- ${c.resourceType.toLowerCase()} \`${c.resourceKey}\` held by ${c.holder.userName}'s agent until ${new Date(c.expiresAt).toISOString().slice(11, 16)} UTC${c.reason ? ` — ${c.reason}` : ''}`,
    )
    .join('\n');
}

export function formatExperts(experts: Expert[]): string {
  if (experts.length === 0) return 'Nobody in the team has visible expertise on this topic yet.';
  return experts
    .map(
      (e) =>
        `- ${e.owner} (${e.agentName}, ${e.status.toLowerCase()}) — ${e.reasons.join('; ')}${e.currentTask ? ` · working on: ${e.currentTask}` : ''} (agentId ${e.agentId})`,
    )
    .join('\n');
}

export function formatContext(ctx: TeamContext): string {
  const lines = [`# DevSync — team ${ctx.team.name}`];
  if (ctx.project) {
    lines.push(
      `Project: **${ctx.project.name}** (your access: ${ctx.project.access})${ctx.project.description ? ` — ${ctx.project.description}` : ''}`,
    );
    if (ctx.project.repositories.length)
      lines.push(
        `Repositories: ${ctx.project.repositories.map((r) => `${r.remoteUrl}@${r.defaultBranch}`).join(', ')}`,
      );
  } else {
    lines.push(
      'This repository is not linked to a DevSync project (link it in the project settings).',
    );
  }
  lines.push('', '## Teammates working now');
  lines.push(
    ctx.teammates.length
      ? ctx.teammates
          .map(
            (t) =>
              `- ${t.owner} (${t.agentName}, ${t.status.toLowerCase()})${t.currentTask ? `: ${t.currentTask}` : ''}${t.projects.length ? ` · ${t.projects.join(', ')}` : ''}${t.branches.length ? ` · branch ${t.branches.join(', ')}` : ''}`,
          )
          .join('\n')
      : 'Nobody else is connected.',
  );
  lines.push('', '## Requests for you', formatInbox(ctx.inbox));
  lines.push('', '## Claimed resources', formatClaims(ctx.claims));
  lines.push('', '## Recent activity', formatActivity(ctx.recentActivity));
  return lines.join('\n');
}
