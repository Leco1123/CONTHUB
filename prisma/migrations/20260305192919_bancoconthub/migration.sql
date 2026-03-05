-- AlterTable
ALTER TABLE "Sheet" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SheetCell" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "SheetColumn" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SheetRow" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DashboardNextAction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardNextAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContflowFeed" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sheetId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContflowFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardNextAction_userId_idx" ON "DashboardNextAction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardNextAction_userId_position_key" ON "DashboardNextAction"("userId", "position");

-- CreateIndex
CREATE INDEX "ContflowFeed_createdAt_idx" ON "ContflowFeed"("createdAt");

-- CreateIndex
CREATE INDEX "ContflowFeed_sheetId_createdAt_idx" ON "ContflowFeed"("sheetId", "createdAt");

-- CreateIndex
CREATE INDEX "ContflowFeed_createdById_createdAt_idx" ON "ContflowFeed"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "Sheet_deletedAt_idx" ON "Sheet"("deletedAt");

-- CreateIndex
CREATE INDEX "SheetCell_deletedAt_idx" ON "SheetCell"("deletedAt");

-- CreateIndex
CREATE INDEX "SheetColumn_sheetId_deletedAt_idx" ON "SheetColumn"("sheetId", "deletedAt");

-- CreateIndex
CREATE INDEX "SheetRow_sheetId_deletedAt_idx" ON "SheetRow"("sheetId", "deletedAt");

-- AddForeignKey
ALTER TABLE "DashboardNextAction" ADD CONSTRAINT "DashboardNextAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContflowFeed" ADD CONSTRAINT "ContflowFeed_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContflowFeed" ADD CONSTRAINT "ContflowFeed_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
