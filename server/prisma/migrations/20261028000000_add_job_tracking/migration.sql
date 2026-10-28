-- CreateTable
CREATE TABLE "job_tracking" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "last_location_at" TIMESTAMP(3),
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "last_error" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_tracking_job_id_key" ON "job_tracking"("job_id");

-- CreateIndex
CREATE INDEX "job_tracking_job_id_idx" ON "job_tracking"("job_id");

-- AddForeignKey
ALTER TABLE "job_tracking" ADD CONSTRAINT "job_tracking_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
