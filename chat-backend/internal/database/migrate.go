package database

import (
	"chat-backend/db"
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsureSchema applies the schema and the additive migrations.
//
// The container mounts `schema.sql` as an init script, but Postgres runs that
// only when the data volume is first created. A database that already existed
// therefore never gains a table or column added afterwards, which is what
// produced `relation "files" does not exist` on an existing development volume.
// Running the same statements on every startup closes that gap; each one is
// idempotent, so a repeat is a no-op.
func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()

	// The simple protocol is used deliberately: it is the one that accepts a
	// multi-statement script in a single round trip, which the extended protocol
	// used by `Exec` does not.
	if _, err := conn.Conn().PgConn().Exec(ctx, db.Schema).ReadAll(); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}

	if _, err := conn.Conn().PgConn().Exec(ctx, db.Migrations).ReadAll(); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}

	return nil
}
