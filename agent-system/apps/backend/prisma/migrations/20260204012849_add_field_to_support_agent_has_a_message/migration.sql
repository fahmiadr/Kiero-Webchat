/*
  Warnings:

  - You are about to drop the column `customer_id` on the `Interaction` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `Interaction` table. All the data in the column will be lost.
  - Added the required column `visitor_id` to the `Interaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Interaction" DROP COLUMN "customer_id",
DROP COLUMN "user_id",
ADD COLUMN     "agent_name" TEXT,
ADD COLUMN     "closed_by" TEXT,
ADD COLUMN     "closed_by_name" TEXT,
ADD COLUMN     "closed_reason" TEXT,
ADD COLUMN     "closed_role" TEXT,
ADD COLUMN     "handled_by" TEXT,
ADD COLUMN     "handled_by_name" TEXT,
ADD COLUMN     "visitor_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "agent_id" TEXT,
ADD COLUMN     "agent_role" TEXT,
ADD COLUMN     "sender_name" TEXT;
