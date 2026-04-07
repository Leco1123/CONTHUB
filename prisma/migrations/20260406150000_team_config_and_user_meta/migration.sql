-- AlterTable
ALTER TABLE "User"
ADD COLUMN "coordenador" TEXT,
ADD COLUMN "equipe" TEXT,
ADD COLUMN "accessProfile" TEXT NOT NULL DEFAULT 'operacional';

-- CreateTable
CREATE TABLE "TeamConfigEntry" (
    "id" SERIAL NOT NULL,
    "coordinator" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamConfigEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_coordenador_idx" ON "User"("coordenador");

-- CreateIndex
CREATE INDEX "User_equipe_idx" ON "User"("equipe");

-- CreateIndex
CREATE INDEX "User_accessProfile_idx" ON "User"("accessProfile");

-- CreateIndex
CREATE UNIQUE INDEX "TeamConfigEntry_coordinator_teamName_key" ON "TeamConfigEntry"("coordinator", "teamName");

-- CreateIndex
CREATE INDEX "TeamConfigEntry_coordinator_order_idx" ON "TeamConfigEntry"("coordinator", "order");

-- CreateIndex
CREATE INDEX "TeamConfigEntry_active_idx" ON "TeamConfigEntry"("active");
