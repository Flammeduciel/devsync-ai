-- CreateEnum
CREATE TYPE "KnowledgeVisibility" AS ENUM ('PRIVATE', 'PROJECT');

-- AlterTable
ALTER TABLE "knowledge" ADD COLUMN     "visibility" "KnowledgeVisibility" NOT NULL DEFAULT 'PROJECT';
