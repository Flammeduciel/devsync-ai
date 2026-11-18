-- CreateTable
CREATE TABLE "knowledge_usages" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "knowledgeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agentId" UUID,
    "version" INTEGER NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_usages_teamId_userId_idx" ON "knowledge_usages"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_usages_knowledgeId_userId_key" ON "knowledge_usages"("knowledgeId", "userId");

-- AddForeignKey
ALTER TABLE "knowledge_usages" ADD CONSTRAINT "knowledge_usages_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_usages" ADD CONSTRAINT "knowledge_usages_knowledgeId_teamId_fkey" FOREIGN KEY ("knowledgeId", "teamId") REFERENCES "knowledge"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_usages" ADD CONSTRAINT "knowledge_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
