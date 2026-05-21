import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

// ─── Usuários ────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  perfil: mysqlEnum("perfil", ["admin", "operacional", "assessor"]).default("assessor").notNull(),
  numeroWhatsapp: varchar("numeroWhatsapp", { length: 20 }),
  ativo: boolean("ativo").default(true).notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Operações ───────────────────────────────────────────────────────────────

export const operacoes = mysqlTable("operacoes", {
  id: int("id").autoincrement().primaryKey(),
  codigoOperacao: varchar("codigoOperacao", { length: 20 }).notNull().unique(),
  nomeCliente: varchar("nomeCliente", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }).notNull(),
  estadoCivil: mysqlEnum("estadoCivil", [
    "Solteiro",
    "Casado",
    "Divorciado",
    "Viúvo",
    "União Estável",
  ]).notNull(),
  emailTomador: varchar("emailTomador", { length: 320 }).notNull(),
  telefoneTomador: varchar("telefoneTomador", { length: 20 }).notNull(),
  nomeConjuge: varchar("nomeConjuge", { length: 255 }),
  cpfConjuge: varchar("cpfConjuge", { length: 14 }),
  emailConjuge: varchar("emailConjuge", { length: 320 }),
  telefoneConjuge: varchar("telefoneConjuge", { length: 20 }),
  produto: mysqlEnum("produto", [
    "Home Equity",
    "Auto Equity",
    "Rural Equity",
    "Imóvel em Construção",
  ]).notNull(),
  valorSolicitado: decimal("valorSolicitado", { precision: 15, scale: 2 }).notNull(),
  prazo: int("prazo").notNull(),
  finalidade: text("finalidade").notNull(),
  // Campo único de contexto (substitui observacoesEstrategicas)
  contextoOperacao: text("contextoOperacao"),
  // Mantido para compatibilidade retroativa
  observacoesEstrategicas: text("observacoesEstrategicas"),
  assessorId: int("assessorId").notNull(),
  responsavelOperacionalId: int("responsavelOperacionalId"),
  statusMacro: mysqlEnum("statusMacro", [
    "Pré-cadastro",
    "Aguardando documentos",
    "Documentação parcial",
    "Documentos ilegíveis",
    "Aguardando SCR",
    "Documentação completa",
    "Em análise IA",
    "Em validação humana",
    "Pronta para distribuição",
    "Em distribuição",
    "Distribuída",
    "Em retorno bancário",
    "Aguardando cliente",
    "Aprovada",
    "Reprovada",
    "Cancelada",
    "Stand-by",
  ])
    .default("Pré-cadastro")
    .notNull(),
  statusValidacaoIa: mysqlEnum("statusValidacaoIa", [
    "Não analisado",
    "Em análise",
    "Validado",
    "Pendência encontrada",
  ])
    .default("Não analisado")
    .notNull(),
  // Prioridade simplificada (Normal/Alta) + retrocompatível
  prioridade: mysqlEnum("prioridade", ["Baixa", "Normal", "Alta", "Urgente"])
    .default("Normal")
    .notNull(),
  statusRascunho: boolean("statusRascunho").default(false).notNull(),
  // SCR
  statusScr: mysqlEnum("statusScr", [
    "Não iniciado",
    "Aguardando assinatura",
    "Parcialmente assinado",
    "Assinado completo",
  ])
    .default("Não iniciado")
    .notNull(),
  observacoesHistorico: json("observacoesHistorico"),
  linkToken: varchar("linkToken", { length: 36 }),
  linkExpiracao: timestamp("linkExpiracao"),
  // Campos da nova etapa de cadastro
  valorGarantia: decimal("valorGarantia", { precision: 15, scale: 2 }),
  tipoGarantiaDescricao: varchar("tipoGarantiaDescricao", { length: 255 }),
  etapaAtual: int("etapaAtual").default(1).notNull(),
  defesaComercial: text("defesaComercial"),
  defesaAprovada: boolean("defesaAprovada").default(false).notNull(),
  perfilExtraidoJson: json("perfilExtraidoJson"),
  ultimaMovimentacaoEm: timestamp("ultimaMovimentacaoEm").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Operacao = typeof operacoes.$inferSelect;
export type InsertOperacao = typeof operacoes.$inferInsert;

// ─── Garantias (expandida para preenchimento por IA) ─────────────────────────

export const garantias = mysqlTable("garantias", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  tipoGarantia: varchar("tipoGarantia", { length: 100 }).notNull(),
  descricao: text("descricao"),
  // Campos extraídos pela IA
  endereco: text("endereco"),
  matricula: varchar("matricula", { length: 100 }),
  metragem: varchar("metragem", { length: 50 }),
  cidade: varchar("cidade", { length: 150 }),
  estado: varchar("estado", { length: 50 }),
  tipoImovel: varchar("tipoImovel", { length: 100 }),
  situacaoDocumental: varchar("situacaoDocumental", { length: 100 }),
  ltvEstimado: decimal("ltvEstimado", { precision: 5, scale: 2 }),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  // Controle
  preenchidoPorIa: boolean("preenchidoPorIa").default(false).notNull(),
  editadoManualmente: boolean("editadoManualmente").default(false).notNull(),
  dadosExtrasJson: json("dadosExtrasJson"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Garantia = typeof garantias.$inferSelect;
export type InsertGarantia = typeof garantias.$inferInsert;

// ─── Documentos ──────────────────────────────────────────────────────────────

export const documentos = mysqlTable("documentos", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  nomeDocumento: varchar("nomeDocumento", { length: 255 }).notNull(),
  categoria: varchar("categoria", { length: 100 }).notNull(),
  estado: mysqlEnum("estado", [
    "Pendente",
    "Enviado",
    "Validado",
    "Pendência encontrada",
    "Ilegível",
    "Vencido",
    "Em Análise",
    "Aprovado",
    "Reprovado",
    "Reenviar",
  ])
    .default("Pendente")
    .notNull(),
  arquivoUrl: text("arquivoUrl"),
  arquivoKey: text("arquivoKey"),
  versaoAtual: int("versaoAtual").default(1).notNull(),
  enviadoPor: int("enviadoPor"),
  observacao: text("observacao"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Documento = typeof documentos.$inferSelect;
export type InsertDocumento = typeof documentos.$inferInsert;

// ─── Versões de Documento ────────────────────────────────────────────────────

export const versoesDocumento = mysqlTable("versoes_documento", {
  id: int("id").autoincrement().primaryKey(),
  documentoId: int("documentoId").notNull(),
  arquivoUrl: text("arquivoUrl").notNull(),
  arquivoKey: text("arquivoKey").notNull(),
  versao: int("versao").notNull(),
  enviadoPor: int("enviadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VersaoDocumento = typeof versoesDocumento.$inferSelect;
export type InsertVersaoDocumento = typeof versoesDocumento.$inferInsert;

// ─── Documentos Complementares ───────────────────────────────────────────────

export const documentosComplementares = mysqlTable("documentos_complementares", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  arquivoUrl: text("arquivoUrl").notNull(),
  arquivoKey: text("arquivoKey").notNull(),
  observacao: text("observacao"),
  enviadoPor: int("enviadoPor"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentoComplementar = typeof documentosComplementares.$inferSelect;
export type InsertDocumentoComplementar = typeof documentosComplementares.$inferInsert;

// ─── Análises IA ─────────────────────────────────────────────────────────────

export const analises_ia = mysqlTable("analises_ia", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  // camada: documental, analista, garantia, revisao
  camada: mysqlEnum("camada", ["documental", "analista", "garantia", "revisao"]).notNull(),
  resultadoJson: json("resultadoJson"),
  resultadoTexto: text("resultadoTexto"),
  promptUtilizado: text("promptUtilizado"),
  modeloUtilizado: varchar("modeloUtilizado", { length: 100 }),
  tokensConsumidos: int("tokensConsumidos"),
  custoEstimado: decimal("custoEstimado", { precision: 10, scale: 6 }),
  tempoProcessamento: int("tempoProcessamento"),
  statusProcessamento: mysqlEnum("statusProcessamento", [
    "processando",
    "concluido",
    "erro",
  ])
    .default("processando")
    .notNull(),
  erroProcessamento: text("erroProcessamento"),
  geradoPor: int("geradoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnaliseIa = typeof analises_ia.$inferSelect;
export type InsertAnaliseIa = typeof analises_ia.$inferInsert;

// ─── Termos SCR ──────────────────────────────────────────────────────────────

export const termosScr = mysqlTable("termos_scr", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  linkUnico: text("linkUnico").notNull(),
  status: mysqlEnum("status", [
    "Aguardando assinatura",
    "Parcialmente assinado",
    "Assinado completo",
  ])
    .default("Aguardando assinatura")
    .notNull(),
  assinadoClienteEm: timestamp("assinadoClienteEm"),
  assinadoConjugeEm: timestamp("assinadoConjugeEm"),
  expiracaoEm: timestamp("expiracaoEm"),
  enviadoPorWhatsapp: boolean("enviadoPorWhatsapp").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TermoScr = typeof termosScr.$inferSelect;
export type InsertTermoScr = typeof termosScr.$inferInsert;

// ─── Instituições Financeiras ────────────────────────────────────────────────

export const instituicoesFinanceiras = mysqlTable("instituicoes_financeiras", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  ifCadastroId: int("ifCadastroId"),
  nomeInstituicao: varchar("nomeInstituicao", { length: 255 }).notNull(),
  dataEnvio: timestamp("dataEnvio"),
  responsavelEnvio: int("responsavelEnvio"),
  status: mysqlEnum("status", [
    "Aguardando",
    "Em análise",
    "Aprovado",
    "Reprovado",
    "Stand-by",
  ])
    .default("Aguardando")
    .notNull(),
  prazoRetornoEstimado: timestamp("prazoRetornoEstimado"),
  ultimaInteracao: timestamp("ultimaInteracao"),
  dataUltimoRetorno: timestamp("dataUltimoRetorno"),
  retorno: text("retorno"),
  motivoRecusa: text("motivoRecusa"),
  proximaAcao: text("proximaAcao"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InstituicaoFinanceira = typeof instituicoesFinanceiras.$inferSelect;
export type InsertInstituicaoFinanceira = typeof instituicoesFinanceiras.$inferInsert;

// ─── Histórico de Status ─────────────────────────────────────────────────────

export const historicoStatusOperacao = mysqlTable("historico_status_operacao", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  statusAnterior: varchar("statusAnterior", { length: 100 }),
  statusNovo: varchar("statusNovo", { length: 100 }).notNull(),
  alteradoPor: int("alteradoPor").notNull(),
  motivo: text("motivo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HistoricoStatus = typeof historicoStatusOperacao.$inferSelect;
export type InsertHistoricoStatus = typeof historicoStatusOperacao.$inferInsert;

// ─── Consentimentos LGPD ─────────────────────────────────────────────────────

export const consentimentosLgpd = mysqlTable("consentimentos_lgpd", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  tokenCliente: varchar("tokenCliente", { length: 36 }),
  tipoConsentimento: varchar("tipoConsentimento", { length: 100 }),
  versaoTermo: varchar("versaoTermo", { length: 20 }),
  ip: varchar("ip", { length: 45 }),
  aceitoEm: timestamp("aceitoEm"),
  validadeAte: timestamp("validadeAte"),
  identificadorSessao: varchar("identificadorSessao", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Cadastro de IFs Parceiras ──────────────────────────────────────────────

export const ifCadastros = mysqlTable("if_cadastros", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
  contatoNome: varchar("contatoNome", { length: 255 }),
  contatoEmail: varchar("contatoEmail", { length: 320 }),
  contatoTel: varchar("contatoTel", { length: 20 }),
  status: mysqlEnum("status", ["Ativa", "Inativa", "Em negociação"]).default("Ativa").notNull(),
  observacoes: text("observacoes"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IfCadastro = typeof ifCadastros.$inferSelect;
export type InsertIfCadastro = typeof ifCadastros.$inferInsert;

// ─── Condições por Produto por IF ────────────────────────────────────────────

export const ifCondicoes = mysqlTable("if_condicoes", {
  id: int("id").autoincrement().primaryKey(),
  ifId: int("ifId").notNull(),
  produto: mysqlEnum("produto", [
    "Home Equity",
    "Auto Equity",
    "Rural Equity",
    "Imóvel em Construção",
  ]).notNull(),
  taxaMinima: decimal("taxaMinima", { precision: 5, scale: 2 }),
  taxaMaxima: decimal("taxaMaxima", { precision: 5, scale: 2 }),
  ltvMaximo: decimal("ltvMaximo", { precision: 5, scale: 2 }),
  prazoMinimo: int("prazoMinimo"),
  prazoMaximo: int("prazoMaximo"),
  valorMinimo: decimal("valorMinimo", { precision: 15, scale: 2 }),
  valorMaximo: decimal("valorMaximo", { precision: 15, scale: 2 }),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IfCondicao = typeof ifCondicoes.$inferSelect;
export type InsertIfCondicao = typeof ifCondicoes.$inferInsert;

// ─── Distribuições de Operações para IFs ─────────────────────────────────────

export const ifDistribuicoes = mysqlTable("if_distribuicoes", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  ifId: int("ifId").notNull(),
  dataEnvio: timestamp("dataEnvio").defaultNow().notNull(),
  statusRetorno: mysqlEnum("statusRetorno", [
    "Aguardando",
    "Em análise",
    "Aprovada",
    "Reprovada",
    "Contraproposta",
  ]).default("Aguardando").notNull(),
  observacoes: text("observacoes"),
  distribuidoPor: int("distribuidoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IfDistribuicao = typeof ifDistribuicoes.$inferSelect;
export type InsertIfDistribuicao = typeof ifDistribuicoes.$inferInsert;

// ─── Notificações ────────────────────────────────────────────────────────────

export const notificacoes = mysqlTable("notificacoes", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  operacaoId: int("operacaoId"),
  tipo: varchar("tipo", { length: 100 }).notNull(),
  mensagem: text("mensagem").notNull(),
  lida: boolean("lida").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notificacao = typeof notificacoes.$inferSelect;
export type InsertNotificacao = typeof notificacoes.$inferInsert;

// ─── Logs de Auditoria ───────────────────────────────────────────────────────

export const logsAuditoria = mysqlTable("logs_auditoria", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId"),
  usuarioId: int("usuarioId"),
  evento: varchar("evento", { length: 100 }).notNull(),
  detalhe: json("detalhe"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LogAuditoria = typeof logsAuditoria.$inferSelect;
export type InsertLogAuditoria = typeof logsAuditoria.$inferInsert;
