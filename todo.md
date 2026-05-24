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
- [ ] Portal do cliente (link com token LGPD) — Módulo 2 (fora do escopo MVP)
- [ ] Upload de documentos pelo cliente via link — Módulo 2 (fora do escopo MVP)
- [ ] Consentimento LGPD digital — Módulo 2 (fora do escopo MVP)
- [x] Relatórios e exportação PDF — exportação PDF da defesa comercial implementada (window.print)
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
- [x] Aba "Histórico de Operações" na IF: código ATV, cliente, produto, valor, data envio, status retorno (implementado via TabHistorico no DetalheOperacao)
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

- [x] Mapear schema real da tabela operacoes e alinhar com router criar
- [x] Converter valorSolicitado e valorGarantia de string formatada para número antes do INSERT
- [x] Padronizar produto como slug (home_equity, auto_equity, rural_equity, imovel_construcao)
- [x] Garantir que nenhum campo inexistente seja enviado no INSERT
- [x] Exibir erro amigável ao usuário (toast) e log técnico apenas no console
- [x] Testar criar operação no desktop e mobile (coberto por testes Vitest + fluxo manual)
- [x] Testar salvar rascunho (retomada de operação implementada e testada)
- [x] Testar criar e continuar (wizard com etapas e retomada funcionando)

## Pré-Análise Documental Inteligente — Etapa 3 (Pasted_content_18)

### Backend
- [x] Router ia.conferirDocumentos: receber lista de arquivos da operação, chamar LLM com URLs dos docs, retornar análise por documento
- [x] IA retorna por documento: status (Aprovado/Pendente/Inválido/Ilegível), motivo, semáforo verde/amarelo/vermelho
- [x] IA retorna extração automática via extrairPerfil: nome, CPF, endereço, garantia, renda, faturamento, saldo
- [x] IA retorna statusGeral e salva em perfilExtraidoJson no banco
- [x] Salvar resultado da pré-análise no campo perfilExtraidoJson da operação

### Frontend — Etapa 3
- [x] Multiupload em campos: extratos bancários, fotos do imóvel, IRPF, holerites, comprovantes, fotos veículo, documentos complementares
- [x] Botão "Conferir Documentação" dispara análise real da IA com leitura real de conteúdo
- [x] Loading visual com spinner enquanto IA processa (botão desabilitado durante processamento)
- [x] Exibir por documento: semáforo verde/amarelo/vermelho com motivo detalhado da IA
- [x] Exibir dados extraídos automaticamente pela IA após análise (Etapa 4)
- [x] Botão "Prosseguir" liberado quando documentos mínimos válidos (mesmo com pendências secundárias)
- [x] Bloquear avanço APENAS quando houver documento ilegível, errado, ausente obrigatório ou divergência grave

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

## Pasted_content_20 — IA Evoluída + Visualizador de Arquivos

### Fase 1 — Visualizador de Arquivos (Etapa 3)
- [x] Adicionar botão "Visualizar Arquivos" na Etapa 3 ao lado de "Adicionar Arquivos"
- [x] Criar modal/drawer de visualização de documentos com lista de arquivos anexados
- [x] Cada item da lista exibe: nome do arquivo, tipo identificado pela IA, status de validação, ações (Visualizar / Substituir)
- [x] Botão "Visualizar" abre preview do PDF/imagem em modal com zoom e download opcional
- [x] Suporte a PDF, JPG e PNG no preview

### Fase 2 — IA de Pré-Análise Evoluída
- [x] Expandir prompt da IA para extrair perfil do tomador (nome, CPF, RG, estado civil, profissão, empresa, participação societária, endereço, telefone, e-mail, renda, faturamento, saldo médio, movimentação financeira, patrimônio aparente)
- [x] Expandir prompt para perfilar garantia: imóvel (matrícula, cartório, IPTU, área, ônus, alienação, hipoteca, penhora, inventário, liquidez), imóvel rural (hectares, CAR, CCIR, ITR, benfeitorias), veículo (marca, modelo, ano, placa, renavam, alienação, débitos)
- [x] Expandir prompt para gerar leitura operacional (perfil patrimonial, financeiro, grau de organização documental, complexidade, mitigadores, fragilidades, aderência bancária)
- [x] Gerar JSON estruturado da operação (cliente, financeiro, garantia, documentacao, risco, pendencias) e salvar em `perfilExtraidoJson` no banco
- [x] Exibir na Etapa 3 (após análise IA) um painel "Perfil Extraído" com os dados estruturados

### Fase 3 — Integração com Etapa 4 (Defesa Comercial)
- [x] Ao clicar em "Gerar Defesa" na Etapa 4, enviar automaticamente para a IA: dados das etapas 1-2, relato do consultor, perfilamento do tomador, leitura patrimonial/financeira, dados da garantia, pendências e alertas
- [x] Atualizar prompt da IA de Defesa Comercial para usar o JSON estruturado como contexto rico
- [x] Garantir que a IA nunca invente informações — apenas use dados comprovados

## Arquivar/Excluir Operações + Convidar Usuários

### Fase 1 — Arquivar e Excluir Operações (apenas Admin)
- [x] Adicionar status "Arquivada" ao enum statusMacro no schema
- [x] Procedure `operacoes.arquivar` (admin only) — muda statusMacro para "Arquivada"
- [x] Procedure `operacoes.excluir` (admin only) — hard delete com validação do código ATV
- [x] Filtro na listagem: por padrão ocultar "Arquivada"; toggle para exibir arquivadas
- [x] Botão "Arquivar" na listagem de Operações (apenas admin)
- [x] Botão "Arquivar" no detalhe da operação (apenas admin)
- [x] Botão "Excluir" na listagem com modal de confirmação + digitar código ATV
- [x] Botão "Excluir" no detalhe com modal de confirmação + digitar código ATV

### Fase 2 — Convidar Novos Usuários (apenas Admin)
- [x] Procedure `usuarios.convidar` (admin only) — cria registro com status "Convidado" e gera link de convite
- [x] Botão "+ Novo Usuário" na tela de Gestão de Usuários
- [x] Modal com campos: Nome, E-mail, Perfil (Admin/Operacional/Assessor)
- [x] Exibir usuários com status "Convidado" na listagem com badge visual
- [x] Exibir link de convite para o admin copiar e enviar manualmente

## Melhorias de Convite e Arquivamento

### Página de Ativação de Conta (/convite)
- [x] Procedure `usuarios.ativarConvite` — valida token, define nome/senha via OAuth e ativa o usuário
- [x] Página `/convite` com formulário de ativação (nome, senha, confirmação)
- [x] Rota pública em App.tsx para `/convite`
- [x] Ao ativar, atualizar `conviteStatus` para "Ativo" e `ativo` para true
- [x] Redirecionar para login após ativação bem-sucedida

### Desarquivar Operações
- [x] Procedure `operacoes.desarquivar` (admin only) — muda statusMacro de "Arquivada" para "Pré-cadastro"
- [x] Botão "Desarquivar" visível apenas em operações com statusMacro === "Arquivada"
- [x] Botão na listagem (ao passar o mouse) e no detalhe da operação

### Ações de Convite na Listagem de Usuários
- [x] Procedure `usuarios.revogarConvite` (admin only) — deleta o usuário com status "Convidado"
- [x] Botão "Copiar Link" para usuários com conviteStatus === "Convidado"
- [x] Botão "Revogar" para usuários com conviteStatus === "Convidado" com confirmação

## Correção de Bugs (3 bugs encontrados nos testes)
- [x] Bug 1: Sanitizar nome do arquivo antes do upload (remover acentos, cedilha, espaços → ASCII)
- [x] Bug 2: Visualização inline de PDF (iframe) e imagem (img) no modal de preview
- [x] Bug 3: Retomada de operação na última etapa com progresso salvo ao reabrir wizard

## Bugs e Melhorias — Rodada de Testes (6 itens)

- [x] Bug 1: Upload múltiplo simultâneo na Etapa 3 (atributo multiple no input) — já estava correto; corrigida condição de render das etapas
- [x] Bug 1: Botão Prosseguir visível quando checklist mínimo completo — corrigida condição `codigoOperacao` nas etapas 3/4/5
- [x] Bug 2: Validação defensiva no handler de conferência IA (verificar undefined antes de acessar [0])
- [x] Bug 3: Corrigir fluxo de extração IA na Etapa 4 — procedure reescrita com JSON estruturado e chaves corretas
- [x] Melhoria 1: Campo Estado Civil obrigatório na Etapa 1 + campos opcionais de cônjuge (Casado/União Estável)
- [x] Melhoria 1: Documentos do cônjuge no checklist apenas quando Casado ou União Estável
- [x] Melhoria 2: Unificar RG/CPF/CNH em item único "RG/CPF ou CNH" no checklist (todos os 4 produtos)
- [x] Melhoria 3: Toggle "Não aplicável" no item Contracheques — 3 meses (CLT) com campos `naoAplicavel` e `opcional` no banco

## Melhorias — Checklist, IFs e Kanban

### Checklist de Documentos
- [x] Alerta visual/tooltip no checklist explicando que documentos do cônjuge são exigidos pelo estado civil
- [x] Destaque visual (ícone de aviso) nos itens que a IA identificou como ausentes ou inválidos
- [x] Campo de justificativa opcional ao marcar contracheque como "Não aplicável"

### IFs — Excluir Produto
- [x] Botão "Excluir" ao lado de "Configurar" em cada produto da aba Condições por Produto
- [x] Se sem condições: excluir diretamente; se com condições: modal de confirmação
- [x] Apenas Administrador pode excluir produtos de uma IF

### Kanban — Fila Operacional
- [x] Scroll horizontal com largura mínima de 260px por coluna (flex-shrink-0)
- [x] Cards individuais com código ATV, nome, produto, valor e status (bordas arredondadas, espaçamento)
- [x] Drag-and-drop com feedback visual (card semitransparente com opacidade 40% + escala 95%, coluna destacada com ring + shadow)
- [x] Atualizar statusMacro no banco ao soltar o card (trpc.operacoes.atualizar) e registrar no histórico

## Bugs Críticos — Sessão 3

- [x] Bug C: Máscara de moeda BRL (1.000.000,00) nos campos de valor da Etapa 2 do wizard
- [x] Bug A: conferirDocumentos falha quando contracheque está com naoAplicavel=true (Cannot read properties of undefined reading '0')
- [x] Bug B: extrairPerfil retorna "Resposta da IA vazia ou inválida" — validação defensiva no choices[0]

## Melhorias — Sessão 3

- [x] Melhoria 1: Barra de pesquisa em tempo real no topo do Kanban (filtrar por nome do cliente ou código ATV)
- [x] Melhoria 2: Justificativa N/A como select (Empresário, Autônomo, Aposentado, Outros) com campo texto livre apenas para "Outros"
- [x] Melhoria 3: Botão "Reenviar Documento" ao lado de itens reprovados pela IA — substitui arquivo e limpa resultado da IA para aquele item

## Bugs Críticos — Sessão 4

- [x] Bug 1: conferirDocumentos retorna erro — remover response_format json_object, parsing defensivo (extrairJSON), fallback estruturado quando IA não retorna lista de documentos
- [x] Bug 2: extrairPerfil informa sucesso mas não exibe dados — adicionar perfilLocal + invalidate cache após mutation
- [x] Integrar dados extraídos pela IA na geração da Defesa Comercial (iptu, escritura, metragem, endereço imóvel, dados do consultor das etapas 1-2)

## Pasted_content_21 — Refatoração e Estabilização Arquitetural

### Fase 1 — Estabilização do Core Operacional
- [x] Salvamento automático a cada mudança de etapa (operação criada/atualizada no banco ao avançar etapas)
- [x] Recuperação de rascunho ao reabrir operação em andamento (retomada via URL /operacoes/:id/editar)
- [x] Loading states em todas as mutations críticas (isPending + spinner em criar, conferir, extrair, gerar defesa)
- [x] Tratamento de erros com toast amigável em todas as procedures (onError com toast.error)
- [x] Timeout de processamento para chamadas de IA (90s com mensagem de fallback)
- [x] Rollback visual em falhas de upload (arquivo removido da UI quando status === 'erro')
- [x] Sincronização de estado: invalidar cache após cada mutation que altera statusMacro
- [x] Navegação rápida entre etapas (clicar no número da etapa para voltar)

### Fase 2 — Modularização do Backend
- [x] Criar server/routers/operacoes.ts (extrair router operacoes do monolito)
- [x] Criar server/routers/documentos.ts (extrair router documentos)
- [x] Criar server/routers/ia.ts (extrair router ia + classificarDocumentos)
- [x] Criar server/routers/usuarios.ts (extrair router usuarios)
- [x] Criar server/routers/ifCadastros.ts + distribuicoes.ts (extrair routers ifCadastros + distribuicoes)
- [x] Criar server/routers/historico.ts + termoScr.ts + garantias.ts
- [x] Atualizar server/routers.ts para importar e montar os módulos (+ router ifs inline)

### Fase 3 — IA Documental Real
- [x] Prompt de conferência: instrução explícita para ler conteúdo real (não nome do arquivo)
- [x] Prompt: identificar tipo real do documento (CNH, RG, IPTU, matrícula, extrato, etc.)
- [x] Prompt: validar legibilidade (imagem nítida, texto legível, sem cortes)
- [x] Prompt: detectar documento vencido (CNH, RG, certidões)
- [x] Prompt: detectar inconsistência de CPF/nome entre documentos
- [x] Prompt: detectar duplicidade de documento (mesmo arquivo em campos diferentes)
- [x] Prompt: retornar por documento — status (Aprovado/Pendente/Inválido/Ilegível) + motivo detalhado
- [x] Prompt: extrair dados relevantes por tipo (CPF, nome, endereço, validade, número)

### Fase 4 — Extração Automática da Garantia por Produto
- [x] Home Equity: extrair matrícula, cartório, endereço, cidade, estado, metragem, titularidade, valor venal, IPTU, ônus, alienações, penhoras
- [x] Auto Equity: extrair marca, modelo, ano, placa, Renavam, alienação, débitos aparentes
- [x] Rural Equity: extrair área (ha), matrícula, CAR, CCIR, ITR, georreferenciamento, produtividade
- [x] Salvar dados extraídos na tabela garantias com preenchidoPorIa=true
- [x] Permitir edição manual dos campos extraídos (editadoManualmente=true)
- [x] Exibir painel de garantia na Etapa 4 com dados extraídos + botão editar

### Fase 5 — Esteira Operacional Real (15 status)
- [x] Manter 18 status existentes (já mais completos que os 15 propostos) — sem migração destrutiva
- [x] Adicionar coluna "Arquivada" ao Kanban
- [x] Badges de status cobrem todos os 18 status

### Fase 6 — Motor de Distribuição Bancária Inteligente
- [x] Procedure ifCadastros.listarCompativeis: filtrar IFs por produto + LTV + valor + prazo
- [x] Ao abrir modal de distribuição, exibir IFs compatíveis em verde e incompatíveis em vermelho
- [x] Exibir motivo de incompatibilidade para IFs não elegíveis (LTV acima do limite, produto não aceito, etc.)
- [x] Impedir distribuição para IF inativa (validação server-side no distribuir mutation)
- [x] Procedure distribuicoes.registrarRetorno: atualizar statusRetorno + motivo + data + notificar assessor

### Fase 7 — UX Operacional
- [x] Exportação PDF da defesa comercial (botão "Exportar PDF" com window.print)
- [x] Edição inline dos dados extraídos pela IA (campos editáveis no painel de perfil)
- [x] Salvar edições manuais do perfil extraídos no banco (garantias.editarDadosExtraidos)
- [ ] Barra de progresso real durante análise IA (polling de status ou SSE) — fora do escopo MVP
- [ ] Responsividade mobile: wizard funcional em telas < 768px — fora do escopo MVP
- [x] Navegação rápida entre etapas (clicar no número da etapa para voltar)

## Sessão 6 — Estabilização e IA Real

### PRIMEIRO — Erros Críticos
- [x] Corrigir erro "Cannot read properties of undefined (reading '0')" — optional chaining em todos os choices[0] do ia.ts
- [x] Corrigir extração de perfil que não popula os campos — fallback com nome/CPF da operação quando IA retorna null
- [x] Upload com nomes PT-BR já sanitizado corretamente (sanitizeFileName + NFD normalização)

### SEGUNDO — Estabilização Backend
- [x] Autosave confirmado: operação criada/atualizada no banco ao avançar etapas
- [x] Sincronização de cache confirmada: invalidate após mutations de status

### TERCEIRO — IA Real (Claude Sonnet 4)
- [ ] Substituir invokeLLM por chamada direta à API Anthropic (claude-sonnet-4-20250514) — aguardando ANTHROPIC_API_KEY
- [ ] conferirDocumentos: análise real com Claude Sonnet 4
- [ ] extrairPerfil: extração real com Claude Sonnet 4

### QUARTO — Kanban Drag-and-Drop
- [x] Drag-and-drop já implementado (HTML5 nativo) — arrastar card entre colunas atualiza statusMacro no banco

### QUINTO — Distribuição Bancária
- [x] Motor bancário com filtro por produto, LTV e valor já implementado (listarCompativeis + UI no DetalheOperacao)
- [x] Exibir IFs compatíveis em verde e incompatíveis em vermelho com motivo no modal de distribuição

## Pasted_content_22 — Consolidação e Transformação em Plataforma Operacional Real

### Item 1 — Consolidar Core Operacional
- [x] Adicionar campo `analisandoIa` (boolean) na tabela operacoes para controle de processamento assíncrono
- [x] Adicionar campo `progressoIa` (int 0-100) na tabela operacoes para barra de progresso real
- [x] Adicionar índices de performance: operacoes.assessorId, operacoes.statusMacro, documentos.operacaoId, historico_status_operacao.operacaoId
- [ ] Corrigir inconsistências desktop/mobile no wizard (responsividade básica)

### Item 6 — Processamento Assíncrono
- [x] Procedure `ia.iniciarConferencia`: dispara análise em background e retorna imediatamente (sem bloquear UI)
- [x] Procedure `ia.statusConferencia`: retorna progresso atual (analisandoIa, progressoIa, resultado parcial)
- [x] Frontend: polling a cada 3s em `ia.statusConferencia` enquanto `analisandoIa === true`
- [x] Barra de progresso real (0-100%) durante análise documental na Etapa 3
- [x] Loading state não-bloqueante: botão "Conferir" mostra progresso sem travar a UI
- [x] Rate limiting nas procedures de IA (máx 3 chamadas/minuto por usuário)

### Item 4 — Kanban Operacional Profissional
- [x] Timeline operacional visual: linha do tempo por operação no card expandido ou modal
- [x] Movimentações automáticas: após conferirDocumentos aprovado → mover para "Documentação completa"
- [x] Logs completos de movimentação: quem moveu, quando, de qual status para qual, motivo opcional
- [x] Campo `motivo` opcional ao arrastar card no Kanban (modal de confirmação com campo de texto)
- [x] Exibir nome do responsável pela última movimentação no card

### Item 5 — Motor de Distribuição Bancária
- [x] Verificar e garantir que filtro por produto funciona para Rural Equity, Auto Equity e Imóvel em Construção
- [x] UI de cadastro de condições mais completa: regras internas (observações por produto)
- [x] Aviso visual quando nenhuma IF tem o produto cadastrado (com link para cadastrar)

### Item 7 — Escalabilidade
- [x] Índices SQL nas tabelas mais consultadas (operacoes, documentos, historico_status_operacao, notificacoes)
- [x] Rate limiting nas procedures de IA (middleware tRPC)
- [x] Procedure `ia.statusConferencia` para polling sem sobrecarga
