import { isUniqueViolation } from '@devsync/database';
import { AppError } from '@devsync/shared';
import { createTeamSchema, updateTeamSchema, type CreateTeamInput, type UpdateTeamInput } from '@devsync/validation';
import { slugify } from '../domain/slug';
import { recordAudit } from '../repositories/audit.repository';
import { teamsRepository } from '../repositories/teams.repository';
import { requireTeamMember, requireTeamPermission } from './access.service';
import { clock, type ServiceDeps } from './ports';

export class TeamsService {
  constructor(private readonly deps: ServiceDeps) {}

  async listMine(userId: string) {
    const memberships = await teamsRepository.listForUser(this.deps.db, userId);
    return memberships.map((m) => ({ ...m.team, role: m.role }));
  }

  async get(userId: string, teamId: string) {
    const { team, role } = await requireTeamMember(this.deps.db, userId, teamId);
    return { ...team, role };
  }

  /** Resolves a team from its URL slug; unknown and foreign teams are both NOT_FOUND. */
  async getBySlug(userId: string, slug: string) {
    const team = await teamsRepository.findActiveBySlug(this.deps.db, slug);
    if (!team) throw new AppError('NOT_FOUND', 'Team not found');
    return this.get(userId, team.id);
  }

  /** Creates a team; the creator becomes OWNER and a default autonomy policy (level 2) is created. */
  async create(userId: string, rawInput: CreateTeamInput) {
    const input = createTeamSchema.parse(rawInput);
    const slug = input.slug ?? slugify(input.name);
    try {
      return await this.deps.db.$transaction(async (tx) => {
        const team = await teamsRepository.create(tx, { name: input.name, slug, ownerId: userId });
        await recordAudit(tx, { teamId: team.id, actorUserId: userId, action: 'team.created', targetType: 'team', targetId: team.id });
        return { ...team, role: 'OWNER' as const };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) throw new AppError('CONFLICT', `The URL "${slug}" is already taken`);
      throw error;
    }
  }

  async update(userId: string, teamId: string, rawInput: UpdateTeamInput) {
    const input = updateTeamSchema.parse(rawInput);
    await requireTeamPermission(this.deps.db, userId, teamId, 'team:update');
    try {
      return await this.deps.db.$transaction(async (tx) => {
        const team = await teamsRepository.update(tx, teamId, input);
        await recordAudit(tx, { teamId, actorUserId: userId, action: 'team.updated', targetType: 'team', targetId: teamId, metadata: input });
        return team;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) throw new AppError('CONFLICT', `The URL "${input.slug}" is already taken`);
      throw error;
    }
  }

  async remove(userId: string, teamId: string) {
    await requireTeamPermission(this.deps.db, userId, teamId, 'team:delete');
    await this.deps.db.$transaction(async (tx) => {
      await teamsRepository.softDelete(tx, teamId, clock(this.deps));
      await recordAudit(tx, { teamId, actorUserId: userId, action: 'team.deleted', targetType: 'team', targetId: teamId });
    });
  }
}
