-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_clients" (
    "id" SERIAL NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowed_origins" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "widget_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocmedAccount" (
    "id" SERIAL NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "url_api" TEXT,
    "token" TEXT,
    "token_secret" TEXT,
    "active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "widget_client_id" INTEGER,

    CONSTRAINT "SocmedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" SERIAL NOT NULL,
    "interaction_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "agent_handle" TEXT,
    "status_chat" TEXT NOT NULL,
    "flag_end" TEXT NOT NULL DEFAULT 'N',
    "channel" TEXT NOT NULL,
    "date_create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "message_id" TEXT NOT NULL,
    "interaction_id" TEXT NOT NULL,
    "flag_to" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "flag_read" INTEGER NOT NULL DEFAULT 0,
    "flag_sent" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "message_id" TEXT NOT NULL,
    "file_origin" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "file_url" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "widget_clients_client_id_key" ON "widget_clients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "SocmedAccount_page_id_key" ON "SocmedAccount"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_interaction_id_key" ON "Interaction"("interaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "Message_message_id_key" ON "Message"("message_id");

-- AddForeignKey
ALTER TABLE "SocmedAccount" ADD CONSTRAINT "SocmedAccount_widget_client_id_fkey" FOREIGN KEY ("widget_client_id") REFERENCES "widget_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "SocmedAccount"("page_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "Interaction"("interaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("message_id") ON DELETE RESTRICT ON UPDATE CASCADE;
