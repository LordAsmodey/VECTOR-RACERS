/*
  Warnings:

  - Added the required column `trackId` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "trackId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE INDEX "Room_trackId_idx" ON "Room"("trackId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
