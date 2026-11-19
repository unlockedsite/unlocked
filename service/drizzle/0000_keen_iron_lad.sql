CREATE TABLE `counters` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `counters_expiry` ON `counters` (`expires`);--> statement-breakpoint
CREATE TABLE `plays` (
	`game` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipts_expiry` ON `request_receipts` (`expires`);