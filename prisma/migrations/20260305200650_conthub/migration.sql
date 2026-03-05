-- CreateTable
CREATE TABLE "ContflowDashboardSnapshot" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContflowDashboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContflowDashboardSnapshot_userId_key" ON "ContflowDashboardSnapshot"("userId");

-- CreateIndex
CREATE INDEX "ContflowDashboardSnapshot_ts_idx" ON "ContflowDashboardSnapshot"("ts");

-- AddForeignKey
ALTER TABLE "ContflowDashboardSnapshot" ADD CONSTRAINT "ContflowDashboardSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
