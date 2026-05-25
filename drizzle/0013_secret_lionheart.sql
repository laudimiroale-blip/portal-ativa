ALTER TABLE `documentos` MODIFY COLUMN `estado` enum('Pendente','Enviado','Validado','Pendência encontrada','Ilegível','Vencido','Em Análise','Aprovado','Reprovado','Reenviar','Aguardando análise','Incompatível','Não aplicável') NOT NULL DEFAULT 'Pendente';--> statement-breakpoint
ALTER TABLE `operacoes` ADD `finalidadePrincipal` enum('Capital de giro','Quitação de dívidas','Expansão empresarial','Investimento operacional','Reforma','Construção','Término de obra','Compra de equipamentos','Reorganização financeira','Liquidez','Investimento rural','Outros');--> statement-breakpoint
ALTER TABLE `operacoes` ADD `categoriaGarantia` enum('Residencial','Comercial','Rural','Veicular','Construção');--> statement-breakpoint
ALTER TABLE `operacoes` ADD `garantiaQuitada` enum('Sim — totalmente quitada','Não — possui financiamento ativo','Parcialmente financiada');--> statement-breakpoint
ALTER TABLE `operacoes` ADD `dividaAtual` decimal(15,2);--> statement-breakpoint
ALTER TABLE `operacoes` ADD `origemRenda` enum('Assalariad');--> statement-breakpoint
ALTER TABLE `operacoes` ADD `resumoInteligente` text;