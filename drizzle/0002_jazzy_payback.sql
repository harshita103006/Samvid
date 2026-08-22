CREATE TABLE `accessRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`organizationId` int NOT NULL,
	`recordId` int NOT NULL,
	`purpose` varchar(255) NOT NULL,
	`status` enum('PENDING','APPROVED','DENIED') NOT NULL DEFAULT 'PENDING',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	CONSTRAINT `accessRequests_id` PRIMARY KEY(`id`)
);
