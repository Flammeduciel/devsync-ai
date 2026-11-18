-- AlterTable
ALTER TABLE "git_activities" ADD COLUMN     "baseRef" TEXT,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "mergeBase" TEXT,
ADD COLUMN     "unmergedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[];
