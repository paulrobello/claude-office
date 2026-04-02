import type { TranslationKey } from "./en";

const es: Record<TranslationKey, string> = {
  // App
  "app.title": "Visualizador de Oficina",
  "app.initializingSystems": "Inicializando sistemas...",

  // Header Controls
  "header.simulate": "SIMULAR",
  "header.reset": "REINICIAR",
  "header.clearDb": "LIMPIAR BD",
  "header.debugOn": "DEPURAR ON",
  "header.debugOff": "DEPURAR OFF",
  "header.settings": "AJUSTES",
  "header.help": "AYUDA",
  "header.status": "Estado",
  "header.connected": "CONECTADO",
  "header.disconnected": "DESCONECTADO",
  "header.aiOn": "ON",
  "header.aiOff": "OFF",
  "header.agents": "agentes",

  // Modals
  "modal.confirmDbWipe": "Confirmar borrado de base de datos",
  "modal.cancel": "Cancelar",
  "modal.wipeAllData": "Borrar todos los datos",
  "modal.wipeWarning":
    "¿Está seguro de que desea eliminar permanentemente todo el historial de sesiones y eventos? Esta acción no se puede deshacer y restablecerá el estado actual del visualizador.",
  "modal.keyboardShortcuts": "Atajos de teclado",
  "modal.close": "Cerrar",
  "modal.toggleDebug": "Alternar modo de depuración",
  "modal.showAgentPaths": "Mostrar rutas de agentes",
  "modal.showQueueSlots": "Mostrar espacios de cola",
  "modal.showPhaseLabels": "Mostrar etiquetas de fase",
  "modal.deleteSession": "Eliminar sesión",
  "modal.delete": "Eliminar",
  "modal.deleteSessionConfirm": "¿Está seguro de que desea eliminar la sesión",
  "modal.deleteSessionWarning": "Esto eliminará permanentemente",
  "modal.events": "eventos",
  "modal.cannotBeUndone": "Esta acción no se puede deshacer.",

  // Settings
  "settings.title": "Configuraciones",
  "settings.clockType": "Tipo de reloj",
  "settings.analog": "Analógico",
  "settings.digital": "Digital",
  "settings.timeFormat": "Formato de hora",
  "settings.12hour": "12 horas",
  "settings.24hour": "24 horas",
  "settings.sessionBehavior": "Comportamiento de sesiones",
  "settings.autoFollow": "Seguir nuevas sesiones automáticamente",
  "settings.autoFollowDesc":
    "Cambiar automáticamente a nuevas sesiones en el proyecto actual",
  "settings.clockTip":
    "Consejo: Haz clic en el reloj de la oficina para alternar rápidamente entre modos.",
  "settings.language": "Idioma",

  // Sessions
  "sessions.title": "Sesiones",
  "sessions.loading": "Cargando sesiones...",
  "sessions.noSessions": "No se encontraron sesiones",
  "sessions.unknownProject": "Proyecto desconocido",
  "sessions.deleteSession": "Eliminar sesión",
  "sessions.events": "eventos",
  "sessions.expandSidebar": "Expandir barra lateral",
  "sessions.collapseSidebar": "Contraer barra lateral",
  "sessions.dragToResize": "Arrastrar para redimensionar",

  // Right Sidebar
  "sidebar.events": "Eventos",
  "sidebar.conversation": "Conversación",

  // Event Log
  "eventLog.title": "Registro de Eventos",
  "eventLog.events": "eventos",
  "eventLog.waiting": "Esperando eventos...",

  // Agent Status
  "agentStatus.title": "Estado del agente",
  "agentStatus.agents": "agentes",
  "agentStatus.noAgents": "Sin agentes",
  "agentStatus.agent": "Agente",
  "agentStatus.desk": "Escritorio",
  "agentStatus.noTaskSummary": "Sin resumen de tarea",
  "agentStatus.noRecentToolCall": "Sin llamada de herramienta reciente",
  "agentStatus.inQueue": "En cola de {queueType} (posición {position})",

  // Git Status
  "git.title": "Estado de Git",
  "git.waitingForStatus": "Esperando el estado de git...",
  "git.noSession": "No hay sesión seleccionada",
  "git.noRepo": "No se detectó repositorio git",
  "git.changedFiles": "Archivos modificados",
  "git.staged": "preparado",
  "git.recentCommits": "Commits recientes",
  "git.noCommits": "No se encontraron commits",
  "git.modified": "modificado",
  "git.added": "agregado",
  "git.deleted": "eliminado",
  "git.renamed": "renombrado",
  "git.copied": "copiado",
  "git.untracked": "sin seguimiento",
  "git.ignored": "ignorado",

  // Conversation
  "conversation.title": "Conversación",
  "conversation.msgs": "msgs",
  "conversation.thinking": "Pensando",
  "conversation.showMore": "Mostrar más",
  "conversation.collapse": "Contraer",
  "conversation.claude": "Claude",
  "conversation.showFullResponse": "Mostrar respuesta completa",
  "conversation.hideToolCalls": "Ocultar llamadas de herramientas",
  "conversation.showToolCalls": "Mostrar llamadas de herramientas",
  "conversation.expandConversation": "Expandir conversación",
  "conversation.close": "Cerrar",
  "conversation.noConversation":
    "Aún no hay conversaciones. Inicia una sesión de Claude Code.",

  // Event Detail Modal
  "eventDetail.summary": "Resumen",
  "eventDetail.tool": "Herramienta",
  "eventDetail.agentName": "Nombre del Agente",
  "eventDetail.taskDescription": "Descripción de la Tarea",
  "eventDetail.userPrompt": "Solicitud del Usuario",
  "eventDetail.thinking": "Pensamiento",
  "eventDetail.message": "Mensaje",
  "eventDetail.resultSummary": "Resumen del Resultado",
  "eventDetail.errorType": "Tipo de Error",
  "eventDetail.toolInput": "Entrada de Herramienta",
  "eventDetail.noDetail": "No hay detalles adicionales disponibles para este evento.",

  // Loading Screen
  "loading.office": "Cargando oficina...",

  // Mobile
  "mobile.menu": "Menú",
  "mobile.agentActivity": "Actividad de agentes",
  "mobile.boss": "JEFE",
  "mobile.noActiveAgents": "No hay agentes activos",
};

export default es;
