# Rio Theaters — Database

This folder contains the version-controlled PostgreSQL database schema and migration files.

## Structure

```text
database/
├── migrations/
│   └── 001_initial_schema.sql
└── README.md
```

## Requirements

- A PostgreSQL database (the team uses Neon as the hosted PostgreSQL provider).
- A PostgreSQL client such as the Neon SQL Editor, `psql`, or another PostgreSQL-compatible tool.

## Apply the initial migration

1. Create a Neon project and a PostgreSQL database for Rio Theaters.
2. Open the SQL Editor for the target database, or connect using the PostgreSQL connection string.
3. Make sure the target database is empty. This initial migration is intended for a fresh database.
4. Run the complete contents of `migrations/001_initial_schema.sql`.
5. Verify that the tables and enum types have been created.

The migration is wrapped in a transaction. If a statement fails, PostgreSQL will not commit a partially created schema.

## Important notes

- Never commit a Neon connection string, password, or `.env` file to Git.
- Store database credentials in environment variables on each developer's machine and in the deployment platform's secret settings.
- Apply each migration only once to a database. Do not rerun `001_initial_schema.sql` on a database where its objects already exist.
- Future schema changes should be added as new numbered files (for example, `002_add_booking_audit.sql`) instead of editing a migration that has already been applied.
- Keep the ER diagram, SQL migrations, and backend database code in sync.

## Current schema scope

The initial schema follows the agreed Rio Theaters ER diagram and includes users, sessions, theaters, cashier-theater assignments, rooms, seats, movies, screenings, bookings, booking seats, seat holds, and payments.

Role-specific permissions (customer, cashier, admin), cashier assignment validation, payment processing, and protection against concurrent seat sales must also be enforced by backend logic and/or additional database constraints. The schema alone does not implement the application authorization workflow.

## Known implementation considerations

- A seat belongs to a room, while its availability is specific to a screening. The backend must always check availability for the selected screening.
- The `seat_holds` table permits only one row with `hold_status = 'active'` for a particular screening and seat. The backend must mark expired holds as `expired` before a new active hold is created.
- `bookings.created_by` records the staff account that created a booking (for example, a cashier sale). It can be NULL for a customer-created booking.
- The `cashier_theaters` foreign keys establish assignments, but the application must verify that the assigned user has the `cashier` role.
- This first migration does not yet enforce non-overlapping screening time ranges or prevent the same seat from being sold in two different bookings for the same screening. Those rules require additional database logic and transactional booking implementation; they must be completed before production use.
