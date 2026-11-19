import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const counters = sqliteTable("counters", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull()
}, table => [index("counters_expiry").on(table.expires)]);

export const requests = sqliteTable("request_receipts", {
  key: text("key").primaryKey(),
  state: text("state").notNull(),
  expires: integer("expires").notNull()
}, table => [index("receipts_expiry").on(table.expires)]);

export const plays = sqliteTable("plays", {
  game: text("game").primaryKey(),
  count: integer("count").notNull()
});

export const presence = sqliteTable("presence", {
  session: text("session").primaryKey(),
  game: text("game").notNull(),
  seen: integer("seen").notNull()
}, table => [index("presence_seen").on(table.seen)]);
