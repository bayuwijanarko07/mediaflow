-- CreateTable
CREATE TABLE "login_audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_audit_logs_userId_idx" ON "login_audit_logs"("userId");

-- CreateIndex
CREATE INDEX "login_audit_logs_email_idx" ON "login_audit_logs"("email");

-- CreateIndex
CREATE INDEX "login_audit_logs_createdAt_idx" ON "login_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "login_audit_logs" ADD CONSTRAINT "login_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
