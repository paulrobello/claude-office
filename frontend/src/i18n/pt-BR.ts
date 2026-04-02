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

  // Sessions
  "sessions.title": "Sessões",
  "sessions.loading": "Carregando sessões...",
  "sessions.noSessions": "Nenhuma sessão encontrada",
  "sessions.unknownProject": "Projeto Desconhecido",
  "sessions.deleteSession": "Excluir sessão",
  "sessions.events": "eventos",
  "sessions.expandSidebar": "Expandir barra lateral",
  "sessions.collapseSidebar": "Recolher barra lateral",
  "sessions.dragToResize": "Arraste para redimensionar",

  // Right Sidebar
  "sidebar.events": "Eventos",
  "sidebar.conversation": "Conversa",

  // Event Log
  "eventLog.title": "Log de Eventos",
  "eventLog.events": "eventos",
  "eventLog.waiting": "Aguardando eventos...",

  // Agent Status
  "agentStatus.title": "Estado dos Agentes",
  "agentStatus.agents": "agentes",
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
  "eventDetail.noDetail": "Nenhum detalhe adicional disponível para este evento.",

  // Loading Screen
  "loading.office": "Carregando escritório...",

  // Mobile
  "mobile.menu": "Menu",
  "mobile.agentActivity": "Atividade dos Agentes",
  "mobile.boss": "CHEFE",
  "mobile.noActiveAgents": "Sem agentes ativos",
};

export default ptBR;
