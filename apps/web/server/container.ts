import 'server-only';
import { serverEnv } from './env';
import { db } from './infrastructure/database';
import { redisEventPublisher } from './infrastructure/event-publisher';
import { mailer } from './infrastructure/mailer';
import { connectedMachines } from './infrastructure/presence';
import { redisDeviceFlowStore } from './infrastructure/device-flow-store';
import { publishControl } from './infrastructure/event-publisher';
import { AgentsService } from './services/agents.service';
import { ClaimsService } from './services/claims.service';
import { DashboardService } from './services/dashboard.service';
import { DevicesService } from './services/devices.service';
import { InboxService } from './services/inbox.service';
import { RealtimeTokenService } from './services/realtime-token.service';
import { TeamDirectoryService } from './services/team-directory.service';
import { InvitationsService } from './services/invitations.service';
import { MembersService } from './services/members.service';
import { ProjectsService } from './services/projects.service';
import type { ServiceDeps } from './services/ports';
import { TeamsService } from './services/teams.service';

function createContainer() {
  const deps: ServiceDeps = {
    db: db(),
    mailer: mailer(),
    publisher: redisEventPublisher,
    appUrl: serverEnv().APP_URL,
  };
  const agents = new AgentsService(deps);
  const inbox = new InboxService(deps);
  const claims = new ClaimsService(deps);
  return {
    agents,
    claims,
    directory: new TeamDirectoryService(deps, agents, inbox, claims),
    devices: new DevicesService(
      deps,
      redisDeviceFlowStore,
      async ({ machineId, teamId }) => {
        await agents.disconnectMachine(machineId);
        await publishControl({ type: 'machine.revoked', machineId, teamId });
      },
      connectedMachines,
    ),
    inbox,
    realtimeTokens: new RealtimeTokenService(deps, serverEnv().REALTIME_JWT_SECRET),
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
