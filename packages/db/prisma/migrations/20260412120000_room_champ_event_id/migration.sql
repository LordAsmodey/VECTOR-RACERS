-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "champEventId" TEXT;

-- CreateIndex
CREATE INDEX "Room_champEventId_idx" ON "Room"("champEventId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_champEventId_fkey" FOREIGN KEY ("champEventId") REFERENCES "ChampEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
