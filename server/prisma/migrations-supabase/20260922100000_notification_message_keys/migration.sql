-- Localizable pro-notification copy.

-- `messageKey` / `messageBodyKey` point at i18n keys in the pro app's
-- translation resources; `params` carries the interpolation values (catalogue
-- data like service names and amounts is passed through, only the static copy
-- is localized). Null keys keep `title` / `body` authoritative, so rows created
-- before this migration (and any non-job-alert kind) render exactly as before.

ALTER TABLE "notifications" ADD COLUMN "message_key" TEXT;
ALTER TABLE "notifications" ADD COLUMN "message_body_key" TEXT;
ALTER TABLE "notifications" ADD COLUMN "params" JSONB;