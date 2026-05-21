CREATE TABLE `if_cadastros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`contatoNome` varchar(255),
	`contatoEmail` varchar(320),
	`contatoTel` varchar(20),
	`status` enum('Ativa','Inativa','Em negociação') NOT NULL DEFAULT 'Ativa',
	`observacoes` text,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `if_cadastros_id` PRIMARY KEY(`id`),
	CONSTRAINT `if_cadastros_cnpj_unique` UNIQUE(`cnpj`)
);
--> statement-breakpoint
CREATE TABLE `if_condicoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ifId` int NOT NULL,
	`produto` enum('Home Equity','Auto Equity','Rural Equity','Imóvel em Construção') NOT NULL,
	`taxaMinima` decimal(5,2),
	`taxaMaxima` decimal(5,2),
	`ltvMaximo` decimal(5,2),
	`prazoMinimo` int,
	`prazoMaximo` int,
	`valorMinimo` decimal(15,2),
	`valorMaximo` decimal(15,2),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `if_condicoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `if_distribuicoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`ifId` int NOT NULL,
	`dataEnvio` timestamp NOT NULL DEFAULT (now()),
	`statusRetorno` enum('Aguardando','Em análise','Aprovada','Reprovada','Contraproposta') NOT NULL DEFAULT 'Aguardando',
	`observacoes` text,
	`distribuidoPor` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `if_distribuicoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usuarioId` int NOT NULL,
	`operacaoId` int,
	`tipo` varchar(100) NOT NULL,
	`mensagem` text NOT NULL,
	`lida` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `perfil` enum('admin','operacional','assessor') NOT NULL DEFAULT 'assessor';