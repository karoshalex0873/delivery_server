-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
