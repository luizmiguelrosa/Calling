-- Additive changes for databases created before these objects existed. The
-- container's init script only runs when the volume is first created, so an
-- existing database would otherwise never gain a table or column added later.
--
-- Every statement here must be idempotent: this file runs on every startup.

-- `messages.is_file` marks a message whose content is a JSON FileContent rather
-- than free text. Older rows are plain text, so the default is false.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_file BOOLEAN NOT NULL DEFAULT false;
