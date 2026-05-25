CREATE TABLE `exportacoes_dossie` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('completa','com_pendencias') NOT NULL,
	`zipKey` text,
	`zipUrl` text,
	`totalDocs` int NOT NULL DEFAULT 0,
	`pendencias` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exportacoes_dossie_id` PRIMARY KEY(`id`)
);
