import { afterAll, describe, expect, it } from 'vitest';
import { DashboardService } from '../../server/services/dashboard.service';
import { ProjectsService } from '../../server/services/projects.service';
import { TeamsService } from '../../server/services/teams.service';
import { createHarness, testDatabaseUrl } from './harness';

describe.skipIf(!testDatabaseUrl)('dashboard', () => {
  const h = createHarness();
  const teams = new TeamsService(h.deps);
  const projects = new ProjectsService(h.deps);
  const dashboard = new DashboardService(h.deps);
  afterAll(() => h.cleanup());

  it('counts only what the user can see and hides the audit trail from developers', async () => {
    const owner = await h.user('Owen');
    const dev = await h.user('Devi');
    const team = await teams.create(owner.id, { name: 'Dash', slug: `dash-${h.run}` });
    await h.db.teamMember.create({ data: { teamId: team.id, userId: dev.id, role: 'DEVELOPER' } });
    const p1 = await projects.create(owner.id, team.id, { name: 'One' });
    await projects.create(owner.id, team.id, { name: 'Two' });
    await projects.addRepository(owner.id, p1.id, { remoteUrl: 'github.com/acme/one' });

    const forOwner = await dashboard.overview(owner.id, team.id);
    expect(forOwner.counts).toMatchObject({ members: 2, projects: 2, repositories: 1, agentsOnline: 0 });
    expect(forOwner.activity.map((a) => a.action)).toContain('project.created');
    await expect(teams.getBySlug(owner.id, `dash-${h.run}`)).resolves.toMatchObject({ id: team.id });

    const forDev = await dashboard.overview(dev.id, team.id);
    expect(forDev.counts).toMatchObject({ projects: 0, repositories: 0 });
    expect(forDev.activity).toEqual([]);

    const outsider = await h.user('Otto');
    await expect(dashboard.overview(outsider.id, team.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(teams.getBySlug(outsider.id, `dash-${h.run}`)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
