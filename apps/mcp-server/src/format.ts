import type {
  ActivityEntry,
  ClaimInfo,
  DeliveredItem,
  DependencyGraph,
  Expert,
  InboxItem,
  RequestDetail,
  TeamContext,
} from '@devsync/sdk';

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
  const work = ctx.yourWork;
  if (
    work &&
    (work.lastDeclaredTask ||
      work.previousSession ||
      work.claimsHeld.length ||
      work.assignedInProgress.length ||
      work.waitingOnOthers.length)
  ) {
    lines.push('', '## Resume your work (from your previous sessions on this machine)');
    if (work.lastDeclaredTask)
      lines.push(
        `- Last declared task (${ago(work.lastDeclaredTask.at)}): ${work.lastDeclaredTask.task}`,
      );
    if (work.previousSession) {
      lines.push(
        `- Previous session ended ${ago(work.previousSession.endedAt)}${work.previousSession.branch ? ` on branch ${work.previousSession.branch}` : ''}`,
      );
      if (work.previousSession.edited.length)
        lines.push(`  ${work.previousSession.edited.join(', ')}`);
    }
    for (const c of work.claimsHeld)
      lines.push(
        `- You still hold ${c.resourceType.toLowerCase()} \`${c.resourceKey}\` (claimId ${c.id}) — release it if you are done`,
      );
    for (const r of work.assignedInProgress)
      lines.push(
        `- Your request in progress: "${r.title}" (${r.status.toLowerCase().replace(/_/g, ' ')}, id ${r.id})`,
      );
    for (const r of work.waitingOnOthers)
      lines.push(
        `- Waiting on ${r.assignee ?? 'a teammate'}: "${r.title}" (${r.status.toLowerCase().replace(/_/g, ' ')}, id ${r.id})`,
      );
    lines.push('Confirm with the developer before resuming any of this.');
  }
  if (ctx.recentKnowledge?.length) {
    lines.push(
      '',
      '## Team knowledge for this project (search before exploring: team_search_knowledge)',
    );
    lines.push(
      ...ctx.recentKnowledge.map(
        (k) =>
          `- "${k.title}" (${k.kind.toLowerCase()}, v${k.version}${k.private ? ', your private note' : ''}, knowledgeId ${k.id})`,
      ),
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

export function formatDelivered(items: DeliveredItem[]): string {
  if (items.length === 0) return '';
  return [
    'Delivered to you (read with team_read_deliverable):',
    ...items.flatMap((d) => [
      `- "${d.title}" (${d.project.name}) by ${d.assigneeUser?.name ?? '?'} — request ${d.id}`,
      ...d.deliverables.map(
        (x) =>
          `  · ${x.format.toLowerCase()} "${x.title}" v${x.currentVersion} (deliverableId ${x.id})`,
      ),
    ]),
  ].join('\n');
}

export function formatRequest(r: RequestDetail): string {
  const lines = [
    `# ${r.title}`,
    `${r.type.toLowerCase()} · ${r.priority} · status ${r.status}${r.awaitingApproval ? ' (awaiting a developer approval)' : ''} · project ${r.project.name}`,
    `From ${r.initiatorAgent ? `${r.createdBy.name}'s agent` : r.createdBy.name} → ${r.assigneeUser?.name ?? '?'}${r.assigneeAgent ? ` (agent ${r.assigneeAgent.name})` : ''}`,
    `Your role: ${r.yourRoles.join(', ') || 'observer'} · actions available to you: ${r.availableActions.join(', ') || 'none'}`,
    '',
    r.description,
  ];
  if (r.instructions) lines.push('', '## Instructions', r.instructions);
  if (r.expectedDeliverables.length)
    lines.push(
      '',
      '## Expected deliverables',
      ...r.expectedDeliverables.map(
        (d) => `- ${d.title} (${d.format})${d.description ? ` — ${d.description}` : ''}`,
      ),
    );
  if (r.comments.length)
    lines.push('', '## Conversation', ...r.comments.map((c) => `- ${c.author}: ${c.body}`));
  if (r.deliverables.length)
    lines.push(
      '',
      '## Deliverables',
      ...r.deliverables.map(
        (d) =>
          `- ${d.status.toLowerCase()} ${d.format.toLowerCase()} "${d.title}" v${d.currentVersion} by ${d.by} (deliverableId ${d.id})`,
      ),
    );
  if (r.tasks.length)
    lines.push(
      '',
      `Tasks: ${r.tasks.map((t) => `${t.title} [${t.status}] (taskId ${t.id})`).join('; ')}`,
    );
  return lines.join('\n');
}

export function formatDependencies(g: DependencyGraph): string {
  const line = (e: DependencyGraph['blockedBy'][number]) =>
    `- [${e.status.toLowerCase()}] ${e.task.title} (${e.task.status.toLowerCase()}, taskId ${e.task.id}${e.task.requestId ? `, request ${e.task.requestId}` : ''})`;
  return [
    `Tasks: ${g.tasks.map((t) => `${t.title} [${t.status}]`).join('; ')}`,
    'Blocked by:',
    ...(g.blockedBy.length ? g.blockedBy.map(line) : ['- nothing']),
    'Blocking:',
    ...(g.blocking.length ? g.blocking.map(line) : ['- nothing']),
  ].join('\n');
}
