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
  // Perfil Ativa: admin = Renata, assessor = consultor
  perfil: mysqlEnum("perfil", ["admin", "assessor"]).default("assessor").notNull(),
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
  // Cônjuge (obrigatório se casado)
  nomeConjuge: varchar("nomeConjuge", { length: 255 }),
  emailConjuge: varchar("emailConjuge", { length: 320 }),
  telefoneConjuge: varchar("telefoneConjuge", { length: 20 }),
  // Produto e financeiro
  produto: mysqlEnum("produto", [
    "Home Equity",
    "Auto Equity",
    "Rural Equity",
    "Imóvel em Construção",
  ]).notNull(),
  valorSolicitado: decimal("valorSolicitado", { precision: 15, scale: 2 }).notNull(),
  prazo: int("prazo").notNull(), // em meses
  finalidade: text("finalidade").notNull(),
  // Responsáveis
  assessorId: int("assessorId").notNull(),
  responsavelOperacionalId: int("responsavelOperacionalId").notNull(),
  // Status e controle
  statusMacro: mysqlEnum("statusMacro", [
    "Pré-cadastro",
    "Aguardando documentos",
    "Documentação parcial",
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
  prioridade: mysqlEnum("prioridade", ["Baixa", "Normal", "Alta", "Urgente"])
    .default("Normal")
    .notNull(),
  statusRascunho: boolean("statusRascunho").default(false).notNull(),
  observacoesEstrategicas: text("observacoesEstrategicas"),
  observacoesHistorico: json("observacoesHistorico"), // array de {texto, editadoPor, editadoEm}
  // Módulo 2 (prever agora)
  linkToken: varchar("linkToken", { length: 36 }),
  linkExpiracao: timestamp("linkExpiracao"),
  // Controle
  ultimaMovimentacaoEm: timestamp("ultimaMovimentacaoEm").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Operacao = typeof operacoes.$inferSelect;
export type InsertOperacao = typeof operacoes.$inferInsert;

// ─── Garantias ───────────────────────────────────────────────────────────────

export const garantias = mysqlTable("garantias", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  tipoGarantia: varchar("tipoGarantia", { length: 100 }).notNull(),
  descricao: text("descricao"),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Garantia = typeof garantias.$inferSelect;
export type InsertGarantia = typeof garantias.$inferInsert;

// ─── Documentos ──────────────────────────────────────────────────────────────

export const documentos = mysqlTable("documentos", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
  nomeDocumento: varchar("nomeDocumento", { length: 255 }).notNull(),
  categoria: varchar("categoria", { length: 100 }).notNull(), // Pessoal, Renda, Imóvel, Veículo, etc.
  estado: mysqlEnum("estado", [
    "Pendente",
    "Enviado",
    "Em Análise",
    "Aprovado",
    "Reprovado",
    "Ilegível",
    "Vencido",
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
  camada: mysqlEnum("camada", ["documental", "analista"]).notNull(),
  resultadoJson: json("resultadoJson"),
  resultadoTexto: text("resultadoTexto"),
  promptUtilizado: text("promptUtilizado"),
  modeloUtilizado: varchar("modeloUtilizado", { length: 100 }),
  tokensConsumidos: int("tokensConsumidos"),
  custoEstimado: decimal("custoEstimado", { precision: 10, scale: 6 }),
  tempoProcessamento: int("tempoProcessamento"), // ms
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

// ─── Instituições Financeiras ────────────────────────────────────────────────

export const instituicoesFinanceiras = mysqlTable("instituicoes_financeiras", {
  id: int("id").autoincrement().primaryKey(),
  operacaoId: int("operacaoId").notNull(),
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

// ─── Consentimentos LGPD (Módulo 2) ─────────────────────────────────────────

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
