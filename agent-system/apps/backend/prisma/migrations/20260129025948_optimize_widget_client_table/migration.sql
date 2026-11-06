/*
  Warnings:

  - You are about to drop the column `page_id` on the `Interaction` table. All the data in the column will be lost.
  - You are about to drop the `SocmedAccount` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[api_key]` on the table `widget_clients` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `client_id` to the `Interaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Interaction" DROP CONSTRAINT "Interaction_page_id_fkey";

-- DropForeignKey
ALTER TABLE "SocmedAccount" DROP CONSTRAINT "SocmedAccount_widget_client_id_fkey";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "Interaction" DROP COLUMN "page_id",
ADD COLUMN     "bot_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "client_id" TEXT NOT NULL,
ADD COLUMN     "queued_at" TIMESTAMP(3),
ADD COLUMN     "waiting_agent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sender_type" TEXT NOT NULL DEFAULT 'visitor';

-- AlterTable
ALTER TABLE "widget_clients" ADD COLUMN     "api_key" TEXT,
ADD COLUMN     "webhook_secret" TEXT,
ADD COLUMN     "webhook_url" TEXT;

-- DropTable
DROP TABLE "SocmedAccount";

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "widget_clients_api_key_key" ON "widget_clients"("api_key");

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "widget_clients"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;
