CREATE TABLE `presence` (
	`session` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `presence_seen` ON `presence` (`seen`);