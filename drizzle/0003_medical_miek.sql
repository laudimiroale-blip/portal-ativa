ALTER TABLE `operacoes` ADD `valorGarantia` decimal(15,2);--> statement-breakpoint
ALTER TABLE `operacoes` ADD `tipoGarantiaDescricao` varchar(255);--> statement-breakpoint
ALTER TABLE `operacoes` ADD `etapaAtual` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `operacoes` ADD `defesaComercial` text;--> statement-breakpoint
ALTER TABLE `operacoes` ADD `defesaAprovada` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `operacoes` ADD `perfilExtraidoJson` json;