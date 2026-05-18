CREATE TABLE `analises_ia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`camada` enum('documental','analista') NOT NULL,
	`resultadoJson` json,
	`resultadoTexto` text,
	`promptUtilizado` text,
	`modeloUtilizado` varchar(100),
	`tokensConsumidos` int,
	`custoEstimado` decimal(10,6),
	`tempoProcessamento` int,
	`statusProcessamento` enum('processando','concluido','erro') NOT NULL DEFAULT 'processando',
	`erroProcessamento` text,
	`geradoPor` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analises_ia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consentimentos_lgpd` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`tokenCliente` varchar(36),
	`tipoConsentimento` varchar(100),
	`versaoTermo` varchar(20),
	`ip` varchar(45),
	`aceitoEm` timestamp,
	`validadeAte` timestamp,
	`identificadorSessao` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consentimentos_lgpd_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`nomeDocumento` varchar(255) NOT NULL,
	`categoria` varchar(100) NOT NULL,
	`estado` enum('Pendente','Enviado','Em Análise','Aprovado','Reprovado','Ilegível','Vencido','Reenviar') NOT NULL DEFAULT 'Pendente',
	`arquivoUrl` text,
	`arquivoKey` text,
	`versaoAtual` int NOT NULL DEFAULT 1,
	`enviadoPor` int,
	`observacao` text,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documentos_complementares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`arquivoUrl` text NOT NULL,
	`arquivoKey` text NOT NULL,
	`observacao` text,
	`enviadoPor` int,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentos_complementares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `garantias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`tipoGarantia` varchar(100) NOT NULL,
	`descricao` text,
	`valorEstimado` decimal(15,2),
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `garantias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `historico_status_operacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`statusAnterior` varchar(100),
	`statusNovo` varchar(100) NOT NULL,
	`alteradoPor` int NOT NULL,
	`motivo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historico_status_operacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `instituicoes_financeiras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`nomeInstituicao` varchar(255) NOT NULL,
	`dataEnvio` timestamp,
	`responsavelEnvio` int,
	`status` enum('Aguardando','Em análise','Aprovado','Reprovado','Stand-by') NOT NULL DEFAULT 'Aguardando',
	`prazoRetornoEstimado` timestamp,
	`ultimaInteracao` timestamp,
	`dataUltimoRetorno` timestamp,
	`retorno` text,
	`motivoRecusa` text,
	`proximaAcao` text,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `instituicoes_financeiras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logs_auditoria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int,
	`usuarioId` int,
	`evento` varchar(100) NOT NULL,
	`detalhe` json,
	`ip` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `logs_auditoria_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codigoOperacao` varchar(20) NOT NULL,
	`nomeCliente` varchar(255) NOT NULL,
	`cpf` varchar(14) NOT NULL,
	`estadoCivil` enum('Solteiro','Casado','Divorciado','Viúvo','União Estável') NOT NULL,
	`emailTomador` varchar(320) NOT NULL,
	`telefoneTomador` varchar(20) NOT NULL,
	`nomeConjuge` varchar(255),
	`emailConjuge` varchar(320),
	`telefoneConjuge` varchar(20),
	`produto` enum('Home Equity','Auto Equity','Rural Equity','Imóvel em Construção') NOT NULL,
	`valorSolicitado` decimal(15,2) NOT NULL,
	`prazo` int NOT NULL,
	`finalidade` text NOT NULL,
	`assessorId` int NOT NULL,
	`responsavelOperacionalId` int NOT NULL,
	`statusMacro` enum('Pré-cadastro','Aguardando documentos','Documentação parcial','Documentação completa','Em análise IA','Em validação humana','Pronta para distribuição','Em distribuição','Distribuída','Em retorno bancário','Aguardando cliente','Aprovada','Reprovada','Cancelada','Stand-by') NOT NULL DEFAULT 'Pré-cadastro',
	`statusValidacaoIa` enum('Não analisado','Em análise','Validado','Pendência encontrada') NOT NULL DEFAULT 'Não analisado',
	`prioridade` enum('Baixa','Normal','Alta','Urgente') NOT NULL DEFAULT 'Normal',
	`statusRascunho` boolean NOT NULL DEFAULT false,
	`observacoesEstrategicas` text,
	`observacoesHistorico` json,
	`linkToken` varchar(36),
	`linkExpiracao` timestamp,
	`ultimaMovimentacaoEm` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operacoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `operacoes_codigoOperacao_unique` UNIQUE(`codigoOperacao`)
);
--> statement-breakpoint
CREATE TABLE `versoes_documento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentoId` int NOT NULL,
	`arquivoUrl` text NOT NULL,
	`arquivoKey` text NOT NULL,
	`versao` int NOT NULL,
	`enviadoPor` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `versoes_documento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `perfil` enum('admin','assessor') DEFAULT 'assessor' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `numeroWhatsapp` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `ativo` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deletedAt` timestamp;