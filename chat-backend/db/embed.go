// Package db carries the SQL sources as embedded files, so the server can apply
// them at startup without depending on the working directory or on the
// container's one-shot init script.
package db

import _ "embed"

// Schema is the full schema. Every statement is idempotent, so it is safe to
// apply on every boot; it creates anything that does not exist yet.
//
//go:embed schema.sql
var Schema string

// Migrations holds additive changes for databases created before an object
// existed. `CREATE TABLE IF NOT EXISTS` cannot add a column to an existing
// table, so those changes live here.
//
//go:embed migrations.sql
var Migrations string
