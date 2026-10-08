-- Grandfather every existing pro service selection: the ACCEPTED-only job
-- matching gate is introduced in the same release, and pros who selected
-- services before Manage Services existed must not lose their jobs.
-- Rejections (and their reasons) are preserved. New selections created after
-- this migration stay PENDING until approved.
UPDATE "pro_services"
SET "status" = 'ACCEPTED'
WHERE "status" = 'PENDING';
