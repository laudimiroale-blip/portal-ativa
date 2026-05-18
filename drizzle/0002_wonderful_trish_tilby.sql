CREATE TABLE `termos_scr` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`linkUnico` text NOT NULL,
	`status` enum('Aguardando assinatura','Parcialmente assinado','Assinado completo') NOT NULL DEFAULT 'Aguardando assinatura',
	`assinadoClienteEm` timestamp,
	`assinadoConjugeEm` timestamp,
	`expiracaoEm` timestamp,
	`enviadoPorWhatsapp` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `termos_scr_id` PRIMARY KEY(`id`),
	CONSTRAINT `termos_scr_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `analises_ia` MODIFY COLUMN `camada` enum('documental','analista','garantia','revisao') NOT NULL;--> statement-breakpoint
ALTER TABLE `documentos` MODIFY COLUMN `estado` enum('Pendente','Enviado','Validado','Pendência encontrada','Ilegível','Vencido','Em Análise','Aprovado','Reprovado','Reenviar') NOT NULL DEFAULT 'Pendente';--> statement-breakpoint
ALTER TABLE `operacoes` MODIFY COLUMN `responsavelOperacionalId` int;--> statement-breakpoint
ALTER TABLE `garantias` ADD `endereco` text;--> statement-breakpoint
ALTER TABLE `garantias` ADD `matricula` varchar(100);--> statement-breakpoint
ALTER TABLE `garantias` ADD `metragem` varchar(50);--> statement-breakpoint
ALTER TABLE `garantias` ADD `cidade` varchar(150);--> statement-breakpoint
ALTER TABLE `garantias` ADD `estado` varchar(50);--> statement-breakpoint
ALTER TABLE `garantias` ADD `tipoImovel` varchar(100);--> statement-breakpoint
ALTER TABLE `garantias` ADD `situacaoDocumental` varchar(100);--> statement-breakpoint
ALTER TABLE `garantias` ADD `ltvEstimado` decimal(5,2);--> statement-breakpoint
ALTER TABLE `garantias` ADD `preenchidoPorIa` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `garantias` ADD `editadoManualmente` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `garantias` ADD `dadosExtrasJson` json;--> statement-breakpoint
ALTER TABLE `garantias` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `operacoes` ADD `cpfConjuge` varchar(14);--> statement-breakpoint
ALTER TABLE `operacoes` ADD `contextoOperacao` text;--> statement-breakpoint
ALTER TABLE `operacoes` ADD `statusScr` enum('Não iniciado','Aguardando assinatura','Parcialmente assinado','Assinado completo') DEFAULT 'Não iniciado' NOT NULL;