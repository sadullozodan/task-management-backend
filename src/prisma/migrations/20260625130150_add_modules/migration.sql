-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('backlog', 'in_progress', 'paused', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ModuleStatus" NOT NULL DEFAULT 'backlog',
    "lead_id" TEXT,
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleIssue" (
    "module_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleIssue_pkey" PRIMARY KEY ("module_id","issue_id")
);

-- CreateIndex
CREATE INDEX "Module_workspace_id_idx" ON "Module"("workspace_id");

-- CreateIndex
CREATE INDEX "Module_project_id_idx" ON "Module"("project_id");

-- CreateIndex
CREATE INDEX "ModuleIssue_issue_id_idx" ON "ModuleIssue"("issue_id");

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleIssue" ADD CONSTRAINT "ModuleIssue_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleIssue" ADD CONSTRAINT "ModuleIssue_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
