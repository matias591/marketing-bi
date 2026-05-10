/**
 * Public schema — application data that's not raw SF mirror or sync ops.
 *
 *   - `public.profiles`: per-user role record. Linked 1:1 with `auth.users`.
 *     A trigger creates the profile row automatically on signup; the role is
 *     'admin' for the first admin (matched by FIRST_ADMIN_EMAIL) and
 *     'end_user' for everyone else.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profiles = pgTable("profiles", {
  // Mirrors auth.users.id; FK constraint added via migration to keep Drizzle
  // schema portable.
  id: uuid().primaryKey(),
  email: text().notNull(),
  role: text().notNull().default("end_user"), // 'admin' | 'end_user'
  createdAt: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
