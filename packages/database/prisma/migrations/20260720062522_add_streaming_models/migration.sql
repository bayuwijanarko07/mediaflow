-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "durationSec" INTEGER,
    "thumbnailUrl" TEXT,
    "masterPlaylistUrl" TEXT,
    "rawFileKey" TEXT,
    "uploadedById" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_renditions" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "bitrateKbps" INTEGER NOT NULL,
    "playlistUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_renditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcode_jobs" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcode_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_genres" (
    "videoId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "video_genres_pkey" PRIMARY KEY ("videoId","genreId")
);

-- CreateTable
CREATE TABLE "watch_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "progressSec" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "lastWatchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "videos_status_idx" ON "videos"("status");

-- CreateIndex
CREATE INDEX "videos_uploadedById_idx" ON "videos"("uploadedById");

-- CreateIndex
CREATE INDEX "video_renditions_videoId_idx" ON "video_renditions"("videoId");

-- CreateIndex
CREATE INDEX "transcode_jobs_videoId_idx" ON "transcode_jobs"("videoId");

-- CreateIndex
CREATE INDEX "transcode_jobs_status_idx" ON "transcode_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE INDEX "watch_history_userId_idx" ON "watch_history"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "watch_history_userId_videoId_key" ON "watch_history"("userId", "videoId");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_renditions" ADD CONSTRAINT "video_renditions_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcode_jobs" ADD CONSTRAINT "transcode_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_genres" ADD CONSTRAINT "video_genres_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_genres" ADD CONSTRAINT "video_genres_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
