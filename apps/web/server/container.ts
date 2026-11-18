import 'server-only';
import { serverEnv } from './env';
import { db } from './infrastructure/database';
import { mailer } from './infrastructure/mailer';
import { DashboardService } from './services/dashboard.service';
import { InvitationsService } from './services/invitations.service';
import { MembersService } from './services/members.service';
import { ProjectsService } from './services/projects.service';
import type { ServiceDeps } from './services/ports';
import { TeamsService } from './services/teams.service';

function createContainer() {
  const deps: ServiceDeps = { db: db(), mailer: mailer(), appUrl: serverEnv().APP_URL };
  return {
    teams: new TeamsService(deps),
    members: new MembersService(deps),
    invitations: new InvitationsService(deps),
    projects: new ProjectsService(deps),
    dashboard: new DashboardService(deps),
  };
}

const globalForContainer = globalThis as unknown as {
  __devsyncServices?: ReturnType<typeof createContainer>;
};

/** Service singletons wired with production infrastructure. */
export function services(): ReturnType<typeof createContainer> {
  globalForContainer.__devsyncServices ??= createContainer();
  return globalForContainer.__devsyncServices;
}
