-- CreateEnum
CREATE TYPE "SheetAuditAction" AS ENUM ('SHEET_CREATED', 'SHEET_RENAMED', 'SHEET_DELETED', 'COLUMN_ADDED', 'COLUMN_RENAMED', 'COLUMN_MOVED', 'COLUMN_DELETED', 'COLUMN_RESIZED', 'ROW_INSERTED', 'ROW_DUPLICATED', 'ROW_DELETED', 'ROW_MOVED', 'CELL_UPDATED', 'RANGE_UPDATED', 'IMPORT_REPLACED', 'IMPORT_APPENDED', 'IMPORT_MERGED', 'VIEW_UPDATED');

-- CreateEnum
CREATE TYPE "SheetLockScope" AS ENUM ('CELL');

-- CreateTable
CREATE TABLE "Sheet" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetColumn" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 140,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetRow" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "clientRowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetCell" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "rowId" INTEGER NOT NULL,
    "colKey" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetView" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "colWidths" JSONB,
    "filters" JSONB,
    "sort" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetLock" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "scope" "SheetLockScope" NOT NULL DEFAULT 'CELL',
    "userId" INTEGER NOT NULL,
    "rowId" INTEGER NOT NULL,
    "colKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetAudit" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "action" "SheetAuditAction" NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "actorId" INTEGER,
    "actorEmail" TEXT,
    "targetUserId" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SheetAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sheet_key_key" ON "Sheet"("key");

-- CreateIndex
CREATE INDEX "Sheet_active_idx" ON "Sheet"("active");

-- CreateIndex
CREATE INDEX "Sheet_createdById_idx" ON "Sheet"("createdById");

-- CreateIndex
CREATE INDEX "SheetColumn_sheetId_order_idx" ON "SheetColumn"("sheetId", "order");

-- CreateIndex
CREATE INDEX "SheetColumn_sheetId_active_idx" ON "SheetColumn"("sheetId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SheetColumn_sheetId_key_key" ON "SheetColumn"("sheetId", "key");

-- CreateIndex
CREATE INDEX "SheetRow_sheetId_order_idx" ON "SheetRow"("sheetId", "order");

-- CreateIndex
CREATE INDEX "SheetRow_sheetId_active_idx" ON "SheetRow"("sheetId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SheetRow_sheetId_clientRowId_key" ON "SheetRow"("sheetId", "clientRowId");

-- CreateIndex
CREATE INDEX "SheetCell_sheetId_colKey_idx" ON "SheetCell"("sheetId", "colKey");

-- CreateIndex
CREATE INDEX "SheetCell_sheetId_updatedAt_idx" ON "SheetCell"("sheetId", "updatedAt");

-- CreateIndex
CREATE INDEX "SheetCell_updatedById_updatedAt_idx" ON "SheetCell"("updatedById", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SheetCell_rowId_colKey_key" ON "SheetCell"("rowId", "colKey");

-- CreateIndex
CREATE INDEX "SheetView_sheetId_idx" ON "SheetView"("sheetId");

-- CreateIndex
CREATE INDEX "SheetView_userId_idx" ON "SheetView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetView_sheetId_userId_key" ON "SheetView"("sheetId", "userId");

-- CreateIndex
CREATE INDEX "SheetLock_sheetId_expiresAt_idx" ON "SheetLock"("sheetId", "expiresAt");

-- CreateIndex
CREATE INDEX "SheetLock_userId_expiresAt_idx" ON "SheetLock"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SheetLock_sheetId_rowId_colKey_key" ON "SheetLock"("sheetId", "rowId", "colKey");

-- CreateIndex
CREATE INDEX "SheetAudit_sheetId_createdAt_idx" ON "SheetAudit"("sheetId", "createdAt");

-- CreateIndex
CREATE INDEX "SheetAudit_actorId_createdAt_idx" ON "SheetAudit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "SheetAudit_action_createdAt_idx" ON "SheetAudit"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SheetAudit_requestId_idx" ON "SheetAudit"("requestId");

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetColumn" ADD CONSTRAINT "SheetColumn_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetRow" ADD CONSTRAINT "SheetRow_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetCell" ADD CONSTRAINT "SheetCell_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetCell" ADD CONSTRAINT "SheetCell_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SheetRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetCell" ADD CONSTRAINT "SheetCell_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetView" ADD CONSTRAINT "SheetView_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetView" ADD CONSTRAINT "SheetView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetLock" ADD CONSTRAINT "SheetLock_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetLock" ADD CONSTRAINT "SheetLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetLock" ADD CONSTRAINT "SheetLock_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SheetRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetAudit" ADD CONSTRAINT "SheetAudit_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetAudit" ADD CONSTRAINT "SheetAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetAudit" ADD CONSTRAINT "SheetAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
