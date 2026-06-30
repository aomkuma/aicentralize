-- CreateTable
CREATE TABLE "ProjectGeneralNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGeneralNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectGeneralNote_projectId_createdAt_idx" ON "ProjectGeneralNote"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectGeneralNote_tenantId_createdAt_idx" ON "ProjectGeneralNote"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectGeneralNote_authorId_createdAt_idx" ON "ProjectGeneralNote"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectGeneralNote" ADD CONSTRAINT "ProjectGeneralNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeneralNote" ADD CONSTRAINT "ProjectGeneralNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeneralNote" ADD CONSTRAINT "ProjectGeneralNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
