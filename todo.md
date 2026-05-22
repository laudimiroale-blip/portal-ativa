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

## Pendências Futuras (Módulo 2) — fora do escopo MVP atual
- [ ] Portal do cliente (link com token LGPD) — Módulo 2
- [ ] Upload de documentos pelo cliente via link — Módulo 2
- [ ] Consentimento LGPD digital — Módulo 2
- [ ] Relatórios e exportação PDF — Módulo 2
- [x] Gestão de usuários (tela admin) — implementado no Módulo 07

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

## Módulo 07 — Login com 3 Níveis de Usuário (Pasted_content_16)
- [x] Adicionar perfil "operacional" ao enum de perfis no schema (users)
- [x] RBAC: Operacional vê operações de sua equipe, pode validar docs, não gerencia usuários/IFs
- [x] Consultor: redirecionar para /operacoes após login (não para /dashboard)
- [x] Consultor: ocultar menu Dashboard, IFs e Usuários no sidebar
- [x] Operacional: ocultar menu Usuários no sidebar
- [x] Tela de gestão de usuários /usuarios (Admin only): listar, criar, editar perfil e ativar/desativar

## Módulo 04 — Portal de Instituições Financeiras (Pasted_content_16)
- [x] Tabela if_condicoes no schema (taxa, LTV, prazo, valor por produto)
- [x] Tabela if_distribuicoes no schema (operacao_id, if_id, data_envio, status_retorno)
- [x] Tabela notificacoes no schema (usuario_id, operacao_id, tipo, mensagem, lida)
- [x] Migrar banco com as 3 novas tabelas + índices de performance
- [x] Tela /ifs: lista de IFs com nome, produtos, status, SLA médio, total operações enviadas
- [x] Busca por nome na lista de IFs
- [x] Botão "+ Nova IF" no topo direito
- [x] Formulário de cadastro/edição de IF (nome, CNPJ, contato, status, observações)
- [x] Aba "Condições por Produto" na IF: taxa min/max, LTV, prazo min/max, valor min/max, obs
- [ ] Aba "Histórico de Operações" na IF: código ATV, cliente, produto, valor, data envio, status retorno (pendente — requer dados de distribuição)
- [x] Modal "Distribuir para IFs" no detalhe da operação (status "Pronta para distribuição")
- [x] Registrar distribuição com data/hora e atualizar status da operação para "Em distribuição"
- [x] Pré-cadastrar as 24 IFs parceiras com status "Ativa"
- [x] Menu lateral: item "Instituições Financeiras" visível para Admin e Operacional (oculto para Consultor)

## Ajustes Pós-Diagnóstico — Prioridade Alta e Média (Observações Estratégicas v2)

### Bloco 1 — Integração Aba IFs com Cadastro
- [x] Substituir campo de texto livre por select das IFs ativas do cadastro na aba IFs da operação
- [x] Exibir nome do responsável pelo envio (usuário logado) na aba de IFs
- [x] Adicionar procedure ifCadastros.listarAtivas (retorna id + nome das IFs com status Ativa)
- [x] Adicionar procedure ifCadastros.metricasPorIF (total enviado, aprovado, reprovado, SLA médio por IF)
- [x] Adicionar procedure ifCadastros.historicoDistribuicoes (operações distribuídas por IF com status)

### Bloco 2 — Painel de Notificações Interno
- [x] Router tRPC: notificacoes.listar, notificacoes.marcarLida, notificacoes.marcarTodasLidas
- [x] Componente NotificacoesSino no header do AtivaDashboardLayout (badge com contagem de não lidas)
- [x] Dropdown de notificações com lista e marcar como lida
- [x] Disparar notificação interna ao criar nova operação (Admin)
- [x] Disparar notificação interna quando status muda para Documentação Completa
- [x] Disparar notificação interna quando status muda para Pronta para Análise
- [x] Disparar notificação interna quando status muda para Pronta para Distribuição

### Bloco 3 — Responsável Operacional
- [x] Campo responsavelOperacionalId no formulário de criação (Etapa 2) — select de usuários admin/operacional
- [x] Campo responsável operacional editável na aba Dados do detalhe da operação
- [x] Filtro por responsável operacional no router operacoes.listar
- [x] Exibir coluna de responsável operacional na lista de operações
- [x] Exibir responsável nos cards da fila operacional

### Bloco 4 — Histórico/Métricas por IF e Fila Granular
- [x] Aba "Histórico de Operações" na tela /ifs: código ATV, cliente, produto, data envio, status retorno
- [x] Métricas por IF na tela /ifs: total enviado, aprovadas, reprovadas, SLA médio
- [x] Granularidade da fila operacional: adicionar categorias "Documentos ilegíveis" e "Aguardando SCR"
- [x] SLA avançado: 4 alertas distintos (24h sem movimentação, docs 48h, prazo bancário vencido, 7 dias parada)

## Correção Persistência Nova Operação

- [ ] Mapear schema real da tabela operacoes e alinhar com router criar
- [ ] Converter valorSolicitado e valorGarantia de string formatada para número antes do INSERT
- [ ] Padronizar produto como slug (home_equity, auto_equity, rural_equity, imovel_construcao)
- [ ] Garantir que nenhum campo inexistente seja enviado no INSERT
- [ ] Exibir erro amigável ao usuário (toast) e log técnico apenas no console
- [ ] Testar criar operação no desktop e mobile
- [ ] Testar salvar rascunho
- [ ] Testar criar e continuar

## Pré-Análise Documental Inteligente — Etapa 3 (Pasted_content_18)

### Backend
- [ ] Router ia.preAnalisarDocumentos: receber lista de arquivos da operação, chamar LLM com URLs dos docs, retornar análise por documento
- [ ] IA retorna por documento: tipoIdentificado, pertenceAoCampo, legivel, integro, pertenceAoCliente, observacoes, statusValidacao (ok/pendencia/critico)
- [ ] IA retorna extração automática: nome, CPF, endereço, estadoCivil, matriculaImovel, enderecoImovel, metragem, cidade, UF, titularidade, onus, renda, saldoMedio, faturamento
- [ ] IA retorna statusGeral: "Documentação completa" | "Parcialmente completa" | "Pendências relevantes" | "Necessita regularização" | "Pronta para análise sênior"
- [ ] Salvar resultado da pré-análise no campo perfilExtratidoJson da operação

### Frontend — Etapa 3
- [ ] Multiupload em campos: extratos bancários, fotos do imóvel, IRPF, holerites, comprovantes, fotos veículo, documentos complementares
- [ ] Botão "Conferir Documentação" dispara análise real da IA (não apenas verificação de upload)
- [ ] Loading visual com progresso enquanto IA processa (não travar interface)
- [ ] Exibir por documento: ✔ Validado / ⚠ Pendência / ✖ Incorreto com tipo identificado e observações da IA
- [ ] Exibir dados extraídos automaticamente pela IA após análise
- [ ] Botão "Prosseguir" liberado quando documentos mínimos válidos (mesmo com pendências secundárias)
- [ ] Bloquear avanço APENAS quando houver documento ilegível, errado, ausente obrigatório ou divergência grave

## Upload em Lote com Classificação por IA — Etapa 3
- [x] Área de drag-and-drop no topo da Etapa 3: "UPLOAD DE DOCUMENTAÇÃO EM LOTE"
- [x] Aceitar PDF, JPG, PNG, HEIC, WEBP, DOC, DOCX, XLS, XLSX até 20MB por arquivo
- [x] Router ia.classificarDocumentos: recebe lista de nomes/tipos de arquivos + checklist do produto, retorna mapeamento arquivo→documentoId
- [x] Após classificação, fazer upload de cada arquivo para o documentoId correspondente
- [x] Arquivos não classificados vão para o último item do checklist (complementar)
- [x] Detectar duplicatas por nome+tamanho e exibir aviso antes de enviar
- [x] Lista geral dos arquivos enviados em lote com status (classificando/enviando/enviado/erro) e botão remover
- [x] Não apagar arquivos já adicionados individualmente
- [x] Manter upload individual por item do checklist funcionando normalmente

## Bloco 1 — Limpar Base de Testes (Pasted_content_19)
- [x] DELETE de todas as operações e dados relacionados (documentos, versoes_documento, if_distribuicoes, notificacoes, logs_auditoria)
- [x] DELETE do usuário "Pedro Aqui o Silva"

## Bloco 2 — Criar Usuários de Teste (Pasted_content_19)
- [x] INSERT Alexandre (role=admin) — já existia no banco
- [x] INSERT Renata (role=admin)
- [x] INSERT Consultor 1 (role=assessor)
- [x] INSERT Consultor 2 (role=assessor)
- [x] INSERT Consultor 3 (role=assessor)

## Bloco 3 — Liberar Avanço entre Etapas (Pasted_content_19)
- [x] Remover bloqueio rígido de avanço na Etapa 3 (conferência documental) — manter alertas visuais
- [x] Verificar e remover bloqueio rígido em qualquer outra etapa do wizard (Etapa 4 também liberada)

## Bloco 4 — Kanban na Fila Operacional (Pasted_content_19)
- [x] Reescrever FilaOperacional.tsx como Kanban com 9 colunas
- [x] Mapear status macro existentes para as 9 colunas do Kanban
- [x] Cards com 10 campos: código ATV, nome cliente, produto, valor, status, responsável, prioridade, última movimentação, pendências, % completude documental
- [x] Drag-and-drop entre colunas (HTML5 drag events nativos)
- [x] Filtros: consultor, produto, status, prioridade (todos os 4 filtros implementados)
- [x] Busca rápida por nome/código
- [x] Cores por status, alertas operacionais, badges de pendência
- [x] Manter identidade visual dark premium
