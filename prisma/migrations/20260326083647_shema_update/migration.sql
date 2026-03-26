-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "availableCount" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "imageUrl" TEXT;
