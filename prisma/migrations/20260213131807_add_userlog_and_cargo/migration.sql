/*
  Warnings:

  - Changed the type of `action` on the `UserLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UserLogAction" AS ENUM ('USER_CREATED', 'USER_UPDATED', 'USER_TOGGLED', 'PASSWORD_CHANGED', 'USER_DELETED', 'LOGIN', 'LOGOUT', 'ACCESS_DENIED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_USED');

-- AlterTable
ALTER TABLE "UserLog" DROP COLUMN "action",
ADD COLUMN     "action" "UserLogAction" NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_createdById_idx" ON "Customer"("createdById");

-- CreateIndex
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE INDEX "UserLog_actorId_createdAt_idx" ON "UserLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "UserLog_action_createdAt_idx" ON "UserLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "UserLog" ADD CONSTRAINT "UserLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
