import type { TranslationKey } from "./en";

const ptBR: Record<TranslationKey, string> = {
  // App
  "app.title": "Visualizador do Escritório",
  "app.initializingSystems": "Inicializando Sistemas...",

  // Header Controls
  "header.simulate": "SIMULAR",
  "header.reset": "RESETAR",
  "header.clearDb": "LIMPAR BD",
  "header.debugOn": "DEBUG LIGADO",
  "header.debugOff": "DEBUG DESLIGADO",
  "header.settings": "CONFIGURAÇÕES",
  "header.help": "AJUDA",
  "header.status": "Status",
  "header.connected": "CONECTADO",
  "header.disconnected": "DESCONECTADO",
  "header.aiOn": "LIGADO",
  "header.aiOff": "DESLIGADO",
  "header.agents": "agentes",

  // Modals
  "modal.confirmDbWipe": "Confirmar Limpeza do Banco",
  "modal.cancel": "Cancelar",
  "modal.wipeAllData": "Limpar Todos os Dados",
  "modal.wipeWarning":
    "Tem certeza que deseja excluir permanentemente todo o histórico de sessões e eventos? Esta ação não pode ser desfeita e vai resetar o estado atual do visualizador.",
  "modal.keyboardShortcuts": "Atalhos de Teclado",
  "modal.close": "Fechar",
  "modal.toggleDebug": "Alternar modo debug",
  "modal.showAgentPaths": "Mostrar caminhos dos agentes",
  "modal.showQueueSlots": "Mostrar slots da fila",
  "modal.showPhaseLabels": "Mostrar rótulos de fase",
  "modal.deleteSession": "Excluir Sessão",
  "modal.delete": "Excluir",
  "modal.deleteSessionConfirm": "Tem certeza que deseja excluir a sessão",
  "modal.deleteSessionWarning": "Isso vai remover permanentemente",
  "modal.events": "eventos",
  "modal.cannotBeUndone": "Esta ação não pode ser desfeita.",

  // Settings
  "settings.title": "Configurações",
  "settings.clockType": "Tipo de Relógio",
  "settings.analog": "Analógico",
  "settings.digital": "Digital",
  "settings.timeFormat": "Formato de Hora",
  "settings.12hour": "12 horas",
  "settings.24hour": "24 horas",
  "settings.sessionBehavior": "Comportamento de Sessão",
  "settings.autoFollow": "Seguir novas sessões automaticamente",
  "settings.autoFollowDesc":
    "Alternar automaticamente para novas sessões no projeto atual",
  "settings.clockTip":
    "Dica: Clique no relógio do escritório para alternar rapidamente entre os modos.",
  "settings.language": "Idioma",
  "settings.theme": "Tema",
  "settings.light": "Claro",
  "settings.dark": "Escuro",
  "settings.system": "Sistema",

  // Sessions
  "sessions.title": "Sessões",
  "sessions.loading": "Carregando sessões...",
  "sessions.noSessions": "Nenhuma sessão encontrada",
  "sessions.unknownProject": "Projeto Desconhecido",
  "sessions.deleteSession": "Excluir sessão",
  "sessions.events": "eventos",
  "sessions.events_one": "{count} evento",
  "sessions.events_other": "{count} eventos",
  "sessions.expandSidebar": "Expandir barra lateral",
  "sessions.collapseSidebar": "Recolher barra lateral",
  "sessions.dragToResize": "Arraste para redimensionar",

  // Sidebar Navigation
  "sidebar.wholeOffice": "Escritório Completo",
  "sidebar.allProjects": "Todos os Projetos",
  "sidebar.allSessions": "Todas as Sessões",

  // Right Sidebar
  "sidebar.events": "Eventos",
  "sidebar.conversation": "Conversa",

  // Event Log
  "eventLog.title": "Log de Eventos",
  "eventLog.events": "eventos",
  "eventLog.events_one": "{count} evento",
  "eventLog.events_other": "{count} eventos",
  "eventLog.waiting": "Aguardando eventos...",

  // Agent Status
  "agentStatus.title": "Estado dos Agentes",
  "agentStatus.agents": "agentes",
  "agentStatus.agents_one": "{count} agente",
  "agentStatus.agents_other": "{count} agentes",
  "agentStatus.noAgents": "Sem agentes",
  "agentStatus.agent": "Agente",
  "agentStatus.desk": "Mesa",
  "agentStatus.noTaskSummary": "Sem resumo de tarefa",
  "agentStatus.noRecentToolCall": "Sem chamada de ferramenta recente",
  "agentStatus.inQueue": "Na fila {queueType} (posição {position})",

  // Git Status
  "git.title": "Status do Git",
  "git.waitingForStatus": "Aguardando status do git...",
  "git.noSession": "Nenhuma sessão selecionada",
  "git.noRepo": "Nenhum repositório git detectado",
  "git.changedFiles": "Arquivos Alterados",
  "git.staged": "preparado",
  "git.recentCommits": "Commits Recentes",
  "git.noCommits": "Nenhum commit encontrado",
  "git.modified": "modificado",
  "git.added": "adicionado",
  "git.deleted": "excluído",
  "git.renamed": "renomeado",
  "git.copied": "copiado",
  "git.untracked": "não rastreado",
  "git.ignored": "ignorado",

  // Conversation
  "conversation.title": "Conversa",
  "conversation.msgs": "msgs",
  "conversation.msgs_one": "{count} msg",
  "conversation.msgs_other": "{count} msgs",
  "conversation.thinking": "Pensando",
  "conversation.showMore": "Mostrar mais",
  "conversation.collapse": "Recolher",
  "conversation.claude": "Claude",
  "conversation.showFullResponse": "Mostrar resposta completa",
  "conversation.hideToolCalls": "Ocultar chamadas de ferramentas",
  "conversation.showToolCalls": "Mostrar chamadas de ferramentas",
  "conversation.expandConversation": "Expandir conversa",
  "conversation.close": "Fechar",
  "conversation.noConversation":
    "Sem conversa ainda. Inicie uma sessão do Claude Code.",

  // Event Detail Modal
  "eventDetail.summary": "Resumo",
  "eventDetail.tool": "Ferramenta",
  "eventDetail.agentName": "Nome do Agente",
  "eventDetail.taskDescription": "Descrição da Tarefa",
  "eventDetail.userPrompt": "Prompt do Usuário",
  "eventDetail.thinking": "Pensamento",
  "eventDetail.message": "Mensagem",
  "eventDetail.resultSummary": "Resumo do Resultado",
  "eventDetail.errorType": "Tipo de Erro",
  "eventDetail.toolInput": "Entrada da Ferramenta",
  "eventDetail.noDetail":
    "Nenhum detalhe adicional disponível para este evento.",

  // Loading Screen
  "loading.office": "Carregando escritório...",

  // Zoom Controls
  "zoom.in": "Aumentar zoom",
  "zoom.out": "Diminuir zoom",
  "zoom.reset": "Resetar zoom",

  // Mobile
  "mobile.menu": "Menu",
  "mobile.agentActivity": "Atividade dos Agentes",
  "mobile.boss": "CHEFE",
  "mobile.noActiveAgents": "Sem agentes ativos",

  // Status Messages
  "status.switchedToSession": "Mudou para sessão {sessionId}...",
  "status.deletingSession": "Excluindo sessão {sessionId}...",
  "status.sessionDeleted": "Sessão excluída.",
  "status.failedDeleteSession": "Falha ao excluir sessão.",
  "status.errorConnecting": "Erro ao conectar ao backend.",
  "status.clearingDatabase": "Limpando banco de dados...",
  "status.databaseCleared": "Banco de dados limpo.",
  "status.failedClearDatabase": "Falha ao limpar banco de dados.",
  "status.triggeringSimulation": "Iniciando simulação...",
  "status.simulationStarted": "Simulação iniciada!",
  "status.failedSimulation": "Falha ao iniciar simulação.",
  "status.storeReset": "Estado resetado.",
  "status.sessionDeletedSwitched": "Sessão excluída. Mudou para {sessionName}",
  "status.sessionDeletedNoOthers":
    "Sessão excluída. Nenhuma outra sessão disponível.",
  "status.connectedTo": "Conectado a {sessionName}",
  "status.autoFollowed": "Seguindo nova sessão: {sessionName}",
};

export default ptBR;
