-- AlterTable
ALTER TABLE "team_members" ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];
