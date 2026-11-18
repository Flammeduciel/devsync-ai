import { hasTeamPermission } from '../domain/permissions';
import { dashboardRepository } from '../repositories/dashboard.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { requireTeamMember } from './access.service';
import { clock, type ServiceDeps } from './ports';

/** Team overview. Every figure is computed from PostgreSQL, restricted to what the user may see. */
export class DashboardService {
  constructor(private readonly deps: ServiceDeps) {}

  async overview(userId: string, teamId: string) {
    const { role } = await requireTeamMember(this.deps.db, userId, teamId);
    const seesAll = hasTeamPermission(role, 'project:read_all');
    const projects = await projectsRepository.list(this.deps.db, teamId, seesAll ? {} : { memberUserId: userId });
    const counts = await dashboardRepository.counts(
      this.deps.db,
      teamId,
      projects.map((p) => p.id),
      clock(this.deps),
    );
    const activity = hasTeamPermission(role, 'audit:read') ? await dashboardRepository.recentAudit(this.deps.db, teamId, 8) : [];
    return {
      counts: { ...counts, projects: projects.length },
      recentProjects: projects.slice(0, 5),
      activity: activity.map((a) => ({
        id: a.id,
        action: a.action,
        actor: a.actorUser?.name ?? 'System',
        createdAt: a.createdAt,
      })),
    };
  }
}
