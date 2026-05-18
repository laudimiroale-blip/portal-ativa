# Portal Ativa — TODO

## Fase 2: Schema do banco e migrações
- [x] Criar schema Drizzle completo: operacoes, garantias, documentos, versoes_documento, documentos_complementares, analises_ia, instituicoes_financeiras, historico_status_operacao, logs_auditoria
- [x] Executar migração SQL no banco
- [x] Criar helpers de DB em server/db.ts

## Fase 3: Identidade visual
- [x] Configurar paleta dark mode premium (#0A0A0A, #FAFAFA, #C9A84C) em index.css
- [x] Adicionar fonte DM Sans via Google Fonts
- [x] Criar DashboardLayout customizado com sidebar dourada e tema escuro
- [x] Configurar ThemeProvider para dark mode fixo

## Fase 4: RBAC e autenticação
- [x] Estender tabela users com campo perfil (admin/assessor) e numero_whatsapp
- [x] Criar middleware adminProcedure no tRPC
- [x] Proteger rotas por perfil no App.tsx e nos routers

## Fase 5: Dashboards
- [x] Dashboard Admin: fila operacional, cards por status, alertas SLA, métricas gerais
- [x] Dashboard Assessor: minha carteira, rascunhos, pendências, docs faltantes

## Fase 6: Operações
- [x] Formulário Nova Operação com geração automática de código ATV-2026-XXXXXX
- [x] Modo rascunho com badge visual distinto
- [x] Campos condicionais para cônjuge quando estado civil = Casado
- [x] Lista de operações com filtros (status, produto, assessor, prioridade) e busca
- [x] Tela de detalhe com 5 abas: Documentos, Dados, Análise IA, IFs, Histórico
- [x] Soft delete em todas as operações

## Fase 7: Documentos
- [x] Checklist por produto (Home Equity, Auto Equity, Rural Equity, Imóvel em Construção)
- [x] Upload com progresso e armazenamento S3
- [x] 8 estados por documento: Pendente/Enviado/Em Análise/Aprovado/Reprovado/Ilegível/Vencido/Reenviar
- [x] Versionamento com histórico de versões por documento
- [x] Seção de Documentos Complementares (anexos livres)

## Fase 8: IA
- [x] IA Documental server-side: validação, semáforo verde/amarelo/vermelho por documento
- [x] IA Analista server-side: defesa comercial positiva, máx 2.000 chars
- [x] Aviso obrigatório de responsabilidade humana em toda tela de IA
- [x] Salvar resultado em analises_ia com tokens, custo e tempo de processamento
- [x] Aba Análise IA visível apenas para Admin

## Fase 9: Fila operacional e IFs
- [x] Fila operacional Admin com 8 categorias e cards por operação
- [x] Alertas SLA: operações sem movimentação
- [x] Aba Instituições Financeiras: múltiplas IFs por operação, status, prazo, retorno
- [x] Aba Histórico imutável com todas as mudanças de status

## Fase 10: Revisão e entrega
- [x] Testes Vitest: 14/14 passando (auth, RBAC, código ATV, status macros, checklists)
- [x] Zero erros de TypeScript
- [x] Checkpoint final e entrega ao usuário

## Pendências Futuras (Módulo 2)
- [ ] Portal do cliente (link com token LGPD)
- [ ] Upload de documentos pelo cliente via link
- [ ] Consentimento LGPD digital
- [ ] Relatórios e exportação PDF
- [ ] Gestão de usuários (tela admin)

## V1 Definitiva — Evoluções (Pasted_content_08)

### Dashboard Admin
- [x] Remover botão "Nova Operação" do Dashboard
- [x] Adicionar seção "Visão por Consultor" com métricas individuais (total, em análise, aprovadas, rascunhos)

### Nova Operação — Fluxo de 6 Etapas
- [x] Etapa 1: Dados do Cliente (nome, CPF, estado civil, e-mail, telefone; campos de cônjuge condicionais)
- [x] Etapa 2: Dados da Operação (produto, valor, prazo, finalidade, campo "Contexto da Operação", prioridade Normal/Alta)
- [x] Etapa 3: Upload em lote de documentos com checklist dinâmico por produto
- [x] Etapa 4: Dados da Garantia preenchidos automaticamente pela IA — modo leitura + botão editar
- [x] Etapa 5: Revisão estilo comitê de crédito — IA gera resumo, parecer, defesa, análise documental e conclusão; botões copiar/editar por campo e copiar tudo
- [x] Etapa 6: Termo SCR — gerar termo, link único, status aguardando/parcialmente assinado/assinado completo

### Ajustes de Schema e Backend
- [x] Adicionar campo `contextoOperacao` na tabela operacoes
- [x] Simplificar prioridade para Normal/Alta
- [x] Adicionar tabela `termos_scr` (id, operacaoId, token, status, assinadoClienteEm, assinadoConjugeEm, linkUnico, createdAt)
- [x] Adicionar procedure `operacoes.metricasPorConsultor` (Admin only)
- [x] Adicionar procedure `ia.preencherGarantia` (extrai dados da garantia dos documentos)
- [x] Adicionar procedure `ia.gerarRevisaoCompleta` (resumo + parecer + defesa + análise + conclusão)
- [x] Adicionar procedures `termoScr.criar`, `termoScr.obter`, `termoScr.assinar`
- [x] Notificação para Admin quando operação fica pronta para validação humana
- [x] Aviso de responsabilidade humana obrigatório na Etapa 5 (Revisão)
