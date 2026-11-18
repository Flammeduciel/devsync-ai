-- Extensions: pgvector (semantic search, Phase 5) and pg_trgm (fuzzy text search).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('MAINTAINER', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('HUMAN', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ONLINE', 'OFFLINE', 'IDLE', 'WORKING', 'WAITING', 'ERROR');

-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('SUGGEST', 'CONTROLLED', 'COORDINATED');

-- CreateEnum
CREATE TYPE "GitProvider" AS ENUM ('GITHUB', 'GITLAB', 'BITBUCKET', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('KNOWLEDGE', 'WORK', 'DEPENDENCY', 'REVIEW', 'COLLABORATION');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_CLARIFICATION', 'COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverableFormat" AS ENUM ('MARKDOWN', 'JSON', 'OPENAPI', 'PDF', 'IMAGE', 'ARCHIVE', 'GIT_REF', 'PULL_REQUEST');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "KnowledgeKind" AS ENUM ('DECISION', 'BRAINSTORM', 'DOCUMENTATION', 'API_CONTRACT', 'SOLUTION', 'ANALYSIS', 'INSTRUCTION', 'DELIVERABLE');

-- CreateEnum
CREATE TYPE "KnowledgeValidity" AS ENUM ('DRAFT', 'VALID', 'OUTDATED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "DependencyStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConflictKind" AS ENUM ('FILE_OVERLAP', 'LINE_OVERLAP', 'POTENTIAL_CONFLICT', 'CONFIRMED_CONFLICT');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('FILE', 'DIRECTORY', 'API_CONTRACT', 'TOPIC');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('AGENT_CONNECTED', 'AGENT_DISCONNECTED', 'REQUEST_CREATED', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_IN_PROGRESS', 'REQUEST_CLARIFICATION', 'DELIVERABLE_READY', 'GIT_CONFLICT', 'KNOWLEDGE_PUBLISHED', 'DEPENDENCY_RESOLVED', 'INVITATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'DEVELOPER',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'DEVELOPER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "GitProvider" NOT NULL DEFAULT 'OTHER',
    "remoteUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_machines" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "os" TEXT,
    "bridgeVersion" TEXT,
    "deviceTokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'claude-code',
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AgentStatus" NOT NULL DEFAULT 'OFFLINE',
    "currentTask" TEXT,
    "pluginVersion" TEXT,
    "lastActivityAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "projectId" UUID,
    "externalSessionId" TEXT NOT NULL,
    "workingDirectory" TEXT,
    "branch" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'ONLINE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activities" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "sessionId" UUID,
    "projectId" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tool" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autonomy_policies" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID,
    "level" "AutonomyLevel" NOT NULL DEFAULT 'CONTROLLED',
    "maxRequestsPerHour" INTEGER NOT NULL DEFAULT 20,
    "maxPriority" "Priority" NOT NULL DEFAULT 'HIGH',
    "maxChainDepth" INTEGER NOT NULL DEFAULT 3,
    "allowedAgentIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "requireApprovalActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "autonomy_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_requests" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "origin" "ActorType" NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "initiatorAgentId" UUID,
    "assigneeUserId" UUID,
    "assigneeAgentId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT,
    "expectedDeliverables" JSONB NOT NULL DEFAULT '[]',
    "dueAt" TIMESTAMPTZ(3),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "parentRequestId" UUID,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "collaboration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_history" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "actorAgentId" UUID,
    "action" TEXT NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus",
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_comments" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorType" "ActorType" NOT NULL,
    "authorUserId" UUID,
    "authorAgentId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "request_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "requestId" UUID,
    "assigneeAgentId" UUID,
    "assigneeUserId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencies" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "dependentTaskId" UUID NOT NULL,
    "blockingTaskId" UUID NOT NULL,
    "status" "DependencyStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "requestId" UUID,
    "taskId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "format" "DeliverableFormat" NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "createdByAgentId" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_versions" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "deliverableId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT,
    "contentType" TEXT,
    "sizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "gitRef" JSONB,
    "url" TEXT,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdByAgentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "requestId" UUID,
    "commentId" UUID,
    "uploadedByUserId" UUID,
    "uploadedByAgentId" UUID,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "KnowledgeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "validity" "KnowledgeValidity" NOT NULL DEFAULT 'VALID',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "authorUserId" UUID NOT NULL,
    "sourceAgentId" UUID,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_versions" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "knowledgeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "references" JSONB NOT NULL DEFAULT '[]',
    "createdByUserId" UUID NOT NULL,
    "createdByAgentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_tags" (
    "teamId" UUID NOT NULL,
    "knowledgeId" UUID NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "knowledge_tags_pkey" PRIMARY KEY ("knowledgeId","tag")
);

-- CreateTable
CREATE TABLE "resource_claims" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "sessionId" UUID,
    "resourceType" "ResourceType" NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_activities" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "agentId" UUID,
    "sessionId" UUID,
    "worktreePath" TEXT NOT NULL,
    "isLinkedWorktree" BOOLEAN NOT NULL DEFAULT false,
    "branch" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "lastCommitSha" TEXT,
    "lastCommitMessage" TEXT,
    "modifiedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stagedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "untrackedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changedHunks" JSONB NOT NULL DEFAULT '{}',
    "aheadBy" INTEGER NOT NULL DEFAULT 0,
    "behindBy" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "git_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_conflicts" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "kind" "ConflictKind" NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "filePath" TEXT NOT NULL,
    "agentAId" UUID NOT NULL,
    "agentBId" UUID NOT NULL,
    "branchA" TEXT NOT NULL,
    "branchB" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedByUserId" UUID,

    CONSTRAINT "git_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "desktop" BOOLEAN NOT NULL DEFAULT true,
    "sound" BOOLEAN NOT NULL DEFAULT false,
    "soundName" TEXT,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "sequence" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "projectId" UUID,
    "type" TEXT NOT NULL,
    "actor" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "audience" UUID[] DEFAULT ARRAY[]::UUID[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("sequence")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "actorAgentId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secretCiphertext" TEXT NOT NULL,
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_tokenHash_key" ON "team_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invitations_teamId_email_idx" ON "team_invitations"("teamId", "email");

-- CreateIndex
CREATE INDEX "team_invitations_email_idx" ON "team_invitations"("email");

-- CreateIndex
CREATE INDEX "projects_teamId_deletedAt_idx" ON "projects"("teamId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "projects_teamId_slug_key" ON "projects"("teamId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_teamId_key" ON "projects"("id", "teamId");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "repositories_teamId_remoteUrl_idx" ON "repositories"("teamId", "remoteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_projectId_remoteUrl_key" ON "repositories"("projectId", "remoteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_id_teamId_key" ON "repositories"("id", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_machines_deviceTokenHash_key" ON "agent_machines"("deviceTokenHash");

-- CreateIndex
CREATE INDEX "agent_machines_teamId_userId_idx" ON "agent_machines"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_machines_id_teamId_key" ON "agent_machines"("id", "teamId");

-- CreateIndex
CREATE INDEX "agents_teamId_status_idx" ON "agents"("teamId", "status");

-- CreateIndex
CREATE INDEX "agents_userId_idx" ON "agents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_machineId_name_key" ON "agents"("machineId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "agents_id_teamId_key" ON "agents"("id", "teamId");

-- CreateIndex
CREATE INDEX "agent_sessions_teamId_endedAt_idx" ON "agent_sessions"("teamId", "endedAt");

-- CreateIndex
CREATE INDEX "agent_sessions_projectId_idx" ON "agent_sessions"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sessions_agentId_externalSessionId_key" ON "agent_sessions"("agentId", "externalSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sessions_id_teamId_key" ON "agent_sessions"("id", "teamId");

-- CreateIndex
CREATE INDEX "agent_activities_teamId_occurredAt_idx" ON "agent_activities"("teamId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "agent_activities_agentId_occurredAt_idx" ON "agent_activities"("agentId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "agent_activities_projectId_occurredAt_idx" ON "agent_activities"("projectId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "autonomy_policies_teamId_projectId_key" ON "autonomy_policies"("teamId", "projectId");

-- CreateIndex
CREATE INDEX "collaboration_requests_teamId_projectId_status_idx" ON "collaboration_requests"("teamId", "projectId", "status");

-- CreateIndex
CREATE INDEX "collaboration_requests_assigneeUserId_status_idx" ON "collaboration_requests"("assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "collaboration_requests_assigneeAgentId_status_idx" ON "collaboration_requests"("assigneeAgentId", "status");

-- CreateIndex
CREATE INDEX "collaboration_requests_createdByUserId_createdAt_idx" ON "collaboration_requests"("createdByUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "collaboration_requests_teamId_fingerprint_createdAt_idx" ON "collaboration_requests"("teamId", "fingerprint", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_requests_id_teamId_key" ON "collaboration_requests"("id", "teamId");

-- CreateIndex
CREATE INDEX "request_history_requestId_createdAt_idx" ON "request_history"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "request_comments_requestId_createdAt_idx" ON "request_comments"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "request_comments_id_teamId_key" ON "request_comments"("id", "teamId");

-- CreateIndex
CREATE INDEX "agent_tasks_teamId_projectId_status_idx" ON "agent_tasks"("teamId", "projectId", "status");

-- CreateIndex
CREATE INDEX "agent_tasks_assigneeAgentId_status_idx" ON "agent_tasks"("assigneeAgentId", "status");

-- CreateIndex
CREATE INDEX "agent_tasks_requestId_idx" ON "agent_tasks"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tasks_id_teamId_key" ON "agent_tasks"("id", "teamId");

-- CreateIndex
CREATE INDEX "dependencies_blockingTaskId_status_idx" ON "dependencies"("blockingTaskId", "status");

-- CreateIndex
CREATE INDEX "dependencies_teamId_projectId_status_idx" ON "dependencies"("teamId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_dependentTaskId_blockingTaskId_key" ON "dependencies"("dependentTaskId", "blockingTaskId");

-- CreateIndex
CREATE INDEX "deliverables_teamId_projectId_createdAt_idx" ON "deliverables"("teamId", "projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "deliverables_requestId_idx" ON "deliverables"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_id_teamId_key" ON "deliverables"("id", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_versions_storageKey_key" ON "deliverable_versions"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_versions_deliverableId_version_key" ON "deliverable_versions"("deliverableId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_requestId_idx" ON "attachments"("requestId");

-- CreateIndex
CREATE INDEX "attachments_commentId_idx" ON "attachments"("commentId");

-- CreateIndex
CREATE INDEX "knowledge_teamId_projectId_validity_idx" ON "knowledge"("teamId", "projectId", "validity");

-- CreateIndex
CREATE INDEX "knowledge_teamId_kind_idx" ON "knowledge"("teamId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_id_teamId_key" ON "knowledge"("id", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_versions_knowledgeId_version_key" ON "knowledge_versions"("knowledgeId", "version");

-- CreateIndex
CREATE INDEX "knowledge_tags_teamId_tag_idx" ON "knowledge_tags"("teamId", "tag");

-- CreateIndex
CREATE INDEX "resource_claims_projectId_resourceType_resourceKey_idx" ON "resource_claims"("projectId", "resourceType", "resourceKey");

-- CreateIndex
CREATE INDEX "resource_claims_agentId_releasedAt_idx" ON "resource_claims"("agentId", "releasedAt");

-- CreateIndex
CREATE INDEX "git_activities_repositoryId_machineId_worktreePath_captured_idx" ON "git_activities"("repositoryId", "machineId", "worktreePath", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "git_activities_teamId_capturedAt_idx" ON "git_activities"("teamId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "git_conflicts_repositoryId_status_idx" ON "git_conflicts"("repositoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "git_conflicts_teamId_fingerprint_key" ON "git_conflicts"("teamId", "fingerprint");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_teamId_kind_key" ON "notification_preferences"("userId", "teamId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "events_id_key" ON "events"("id");

-- CreateIndex
CREATE INDEX "events_teamId_sequence_idx" ON "events"("teamId", "sequence");

-- CreateIndex
CREATE INDEX "events_createdAt_idx" ON "events"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_teamId_createdAt_idx" ON "audit_logs"("teamId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_teamId_targetType_targetId_idx" ON "audit_logs"("teamId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_teamId_idx" ON "api_keys"("teamId");

-- CreateIndex
CREATE INDEX "webhook_endpoints_teamId_enabled_idx" ON "webhook_endpoints"("teamId", "enabled");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_machines" ADD CONSTRAINT "agent_machines_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_machines" ADD CONSTRAINT "agent_machines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_machineId_teamId_fkey" FOREIGN KEY ("machineId", "teamId") REFERENCES "agent_machines"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agentId_teamId_fkey" FOREIGN KEY ("agentId", "teamId") REFERENCES "agents"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_agentId_teamId_fkey" FOREIGN KEY ("agentId", "teamId") REFERENCES "agents"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autonomy_policies" ADD CONSTRAINT "autonomy_policies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autonomy_policies" ADD CONSTRAINT "autonomy_policies_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_initiatorAgentId_fkey" FOREIGN KEY ("initiatorAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_assigneeAgentId_fkey" FOREIGN KEY ("assigneeAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_parentRequestId_fkey" FOREIGN KEY ("parentRequestId") REFERENCES "collaboration_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_history" ADD CONSTRAINT "request_history_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_history" ADD CONSTRAINT "request_history_requestId_teamId_fkey" FOREIGN KEY ("requestId", "teamId") REFERENCES "collaboration_requests"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_history" ADD CONSTRAINT "request_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_history" ADD CONSTRAINT "request_history_actorAgentId_fkey" FOREIGN KEY ("actorAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_requestId_teamId_fkey" FOREIGN KEY ("requestId", "teamId") REFERENCES "collaboration_requests"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_authorAgentId_fkey" FOREIGN KEY ("authorAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "collaboration_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_assigneeAgentId_fkey" FOREIGN KEY ("assigneeAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_dependentTaskId_teamId_fkey" FOREIGN KEY ("dependentTaskId", "teamId") REFERENCES "agent_tasks"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_blockingTaskId_teamId_fkey" FOREIGN KEY ("blockingTaskId", "teamId") REFERENCES "agent_tasks"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "collaboration_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverableId_teamId_fkey" FOREIGN KEY ("deliverableId", "teamId") REFERENCES "deliverables"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_requestId_teamId_fkey" FOREIGN KEY ("requestId", "teamId") REFERENCES "collaboration_requests"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_commentId_teamId_fkey" FOREIGN KEY ("commentId", "teamId") REFERENCES "request_comments"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByAgentId_fkey" FOREIGN KEY ("uploadedByAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_sourceAgentId_fkey" FOREIGN KEY ("sourceAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_knowledgeId_teamId_fkey" FOREIGN KEY ("knowledgeId", "teamId") REFERENCES "knowledge"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_tags" ADD CONSTRAINT "knowledge_tags_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_tags" ADD CONSTRAINT "knowledge_tags_knowledgeId_teamId_fkey" FOREIGN KEY ("knowledgeId", "teamId") REFERENCES "knowledge"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_projectId_teamId_fkey" FOREIGN KEY ("projectId", "teamId") REFERENCES "projects"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_agentId_teamId_fkey" FOREIGN KEY ("agentId", "teamId") REFERENCES "agents"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_claims" ADD CONSTRAINT "resource_claims_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_activities" ADD CONSTRAINT "git_activities_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_activities" ADD CONSTRAINT "git_activities_repositoryId_teamId_fkey" FOREIGN KEY ("repositoryId", "teamId") REFERENCES "repositories"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_activities" ADD CONSTRAINT "git_activities_machineId_teamId_fkey" FOREIGN KEY ("machineId", "teamId") REFERENCES "agent_machines"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_activities" ADD CONSTRAINT "git_activities_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_activities" ADD CONSTRAINT "git_activities_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_conflicts" ADD CONSTRAINT "git_conflicts_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_conflicts" ADD CONSTRAINT "git_conflicts_repositoryId_teamId_fkey" FOREIGN KEY ("repositoryId", "teamId") REFERENCES "repositories"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_conflicts" ADD CONSTRAINT "git_conflicts_agentAId_teamId_fkey" FOREIGN KEY ("agentAId", "teamId") REFERENCES "agents"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_conflicts" ADD CONSTRAINT "git_conflicts_agentBId_teamId_fkey" FOREIGN KEY ("agentBId", "teamId") REFERENCES "agents"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_conflicts" ADD CONSTRAINT "git_conflicts_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorAgentId_fkey" FOREIGN KEY ("actorAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Constraints Prisma cannot express ─────────────

-- A single team-level default autonomy policy (projectId NULL) per team.
CREATE UNIQUE INDEX "autonomy_policies_team_default_key"
  ON "autonomy_policies" ("teamId")
  WHERE "projectId" IS NULL;

-- At most one active (unreleased) claim per resource in a project.
CREATE UNIQUE INDEX "resource_claims_active_key"
  ON "resource_claims" ("projectId", "resourceType", "resourceKey")
  WHERE "releasedAt" IS NULL;

-- An agent cannot conflict with itself; agent pairs are stored in canonical order.
ALTER TABLE "git_conflicts"
  ADD CONSTRAINT "git_conflicts_distinct_agents_check" CHECK ("agentAId" < "agentBId");

-- A task cannot depend on itself.
ALTER TABLE "dependencies"
  ADD CONSTRAINT "dependencies_not_self_check" CHECK ("dependentTaskId" <> "blockingTaskId");

-- Versions start at 1.
ALTER TABLE "deliverable_versions"
  ADD CONSTRAINT "deliverable_versions_version_check" CHECK ("version" >= 1);
ALTER TABLE "knowledge_versions"
  ADD CONSTRAINT "knowledge_versions_version_check" CHECK ("version" >= 1);

-- Who-did-it columns must match the declared actor type.
ALTER TABLE "request_comments"
  ADD CONSTRAINT "request_comments_author_check" CHECK (
    ("authorType" = 'HUMAN' AND "authorUserId" IS NOT NULL) OR
    ("authorType" = 'AGENT' AND "authorAgentId" IS NOT NULL) OR
    ("authorType" = 'SYSTEM')
  );
ALTER TABLE "collaboration_requests"
  ADD CONSTRAINT "collaboration_requests_origin_check" CHECK (
    "origin" <> 'AGENT' OR "initiatorAgentId" IS NOT NULL
  );

-- Case-insensitive uniqueness for emails.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
