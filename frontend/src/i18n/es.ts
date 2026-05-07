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
  "header.tour": "TOUR",

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
  "settings.tabs.general": "General",
  "settings.tabs.building": "Edificio",
  "settings.building.name": "Nombre del Edificio",
  "settings.building.namePlaceholder": "Mi Empresa",
  "settings.building.floors": "Pisos",
  "settings.building.addFloor": "Agregar Piso",
  "settings.building.floorName": "Nombre del Piso",
  "settings.building.floorNumber": "Piso",
  "settings.building.accentColor": "Color",
  "settings.building.icon": "Icono",
  "settings.building.repos": "Carpetas de proyectos",
  "settings.building.reposPlaceholder": "claude-office, mi-api, web-ui",
  "settings.building.save": "Guardar",
  "settings.building.saving": "Guardando...",
  "settings.building.saved": "¡Guardado!",
  "settings.building.deleteFloor": "Eliminar",
  "settings.building.noFloors": "No hay pisos configurados",
  "settings.building.enableHint":
    "Agrega pisos y mapea nombres de carpetas de proyectos para habilitar la vista de edificio",
  "settings.building.unsavedWarning":
    "Tienes cambios sin guardar en el edificio. ¿Descartarlos?",

  // Sessions
  "sessions.title": "Sesiones",
  "sessions.loading": "Cargando sesiones...",
  "sessions.noSessions": "No se encontraron sesiones",
  "sessions.unknownProject": "Proyecto desconocido",
  "sessions.deleteSession": "Eliminar sesión",
  "sessions.events": "eventos",
  "sessions.events_one": "{count} evento",
  "sessions.events_other": "{count} eventos",
  "sessions.expandSidebar": "Expandir barra lateral",
  "sessions.collapseSidebar": "Contraer barra lateral",
  "sessions.dragToResize": "Arrastrar para redimensionar",

  // Right Sidebar
  "sidebar.events": "Eventos",
  "sidebar.conversation": "Conversación",

  // Event Log
  "eventLog.title": "Registro de Eventos",
  "eventLog.events": "eventos",
  "eventLog.events_one": "{count} evento",
  "eventLog.events_other": "{count} eventos",
  "eventLog.waiting": "Esperando eventos...",

  // Agent Status
  "agentStatus.title": "Estado del agente",
  "agentStatus.agents": "agentes",
  "agentStatus.agents_one": "{count} agente",
  "agentStatus.agents_other": "{count} agentes",
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
  "conversation.msgs_one": "{count} msg",
  "conversation.msgs_other": "{count} msgs",
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
  "eventDetail.noDetail":
    "No hay detalles adicionales disponibles para este evento.",

  // Loading Screen
  "loading.office": "Cargando oficina...",

  // Zoom Controls
  "zoom.in": "Acercar",
  "zoom.out": "Alejar",
  "zoom.reset": "Restablecer zoom",

  // Mobile
  "mobile.menu": "Menú",
  "mobile.agentActivity": "Actividad de agentes",
  "mobile.boss": "JEFE",
  "mobile.noActiveAgents": "No hay agentes activos",

  // Status Messages
  "status.switchedToSession": "Cambió a sesión {sessionId}...",
  "status.deletingSession": "Eliminando sesión {sessionId}...",
  "status.sessionDeleted": "Sesión eliminada.",
  "status.failedDeleteSession": "Error al eliminar sesión.",
  "status.errorConnecting": "Error al conectar con el backend.",
  "status.sessionRenamed": "Sesión renombrada.",
  "status.failedRenameSession": "Error al renombrar la sesión.",
  "status.clearingDatabase": "Limpiando base de datos...",
  "status.databaseCleared": "Base de datos limpia.",
  "status.failedClearDatabase": "Error al limpiar base de datos.",
  "status.triggeringSimulation": "Iniciando simulación...",
  "status.simulationStarted": "¡Simulación iniciada!",
  "status.failedSimulation": "Error al iniciar simulación.",
  "status.storeReset": "Estado reiniciado.",
  "status.sessionDeletedSwitched": "Sesión eliminada. Cambió a {sessionName}",
  "status.sessionDeletedNoOthers":
    "Sesión eliminada. No hay otras sesiones disponibles.",
  "status.connectedTo": "Conectado a {sessionName}",
  "status.autoFollowed": "Siguiendo nueva sesión: {sessionName}",

  // Navigation
  "navigation.building": "Edificio",

  // Tour
  "tour.steps.welcome.title": "Bienvenido",
  "tour.steps.welcome.description":
    "Este es tu centro de comando. Haz clic en un piso para explorar.",
  "tour.steps.singleWelcome.title": "Bienvenido a Claude Office",
  "tour.steps.singleWelcome.description":
    "Esta oficina en pixel art muestra tus sesiones de Claude Code en tiempo real. Hagamos un recorrido rápido.",
  "tour.steps.simulate.title": "Iniciar Simulación",
  "tour.steps.simulate.description":
    "Haz clic en Simular para dar vida a la oficina.",
  "tour.steps.agentsArrive.title": "Llegan los Agentes",
  "tour.steps.agentsArrive.description":
    "Los agentes llegan por el ascensor, caminan a sus escritorios y empiezan a trabajar.",
  "tour.steps.inspectAgent.title": "Inspeccionar un Agente",
  "tour.steps.inspectAgent.description":
    "Haz clic en cualquier personaje para inspeccionarlo.",
  "tour.steps.focusPopup.title": "Popup de Enfoque",
  "tour.steps.focusPopup.description":
    "Desde aquí puedes copiar un mensaje al portapapeles e ir a tu terminal. La oficina se actualiza en tiempo real mientras Claude trabaja.",
  "tour.steps.zoomOut.title": "Alejar",
  "tour.steps.zoomOut.description": "Intenta alejar para ver la vista general.",
  "tour.steps.settings.title": "Configurar Pisos",
  "tour.steps.settings.description":
    "Abre Configuración para agregar pisos y mapear carpetas de proyectos para una vista de edificio multi-piso.",
  "tour.skip": "Saltar tour",
  "tour.next": "Siguiente",

  // Attention System
  "attention.toast.permissionRequest": "{agentName} necesita permiso",
  "attention.toast.error": "{agentName} encontró un error",
  "attention.toast.taskCompleted": "{agentName} completó una tarea",
  "attention.toast.agentArrived": "{agentName} se unió a la oficina",
  "attention.toast.stop": "{agentName} se detuvo",
  "attention.toast.backgroundTask": "{agentName}: {taskDescription}",
  "attention.commandBar.placeholder": "Escribe un comando...",
  "attention.commandBar.focusAgent": "Enfocar Agente: {name}",
  "attention.commandBar.focusBoss": "Enfocar Terminal del Jefe",
  "attention.commandBar.showAttention": "Mostrar Cola de Atención",
  "attention.commandBar.dismissAll": "Descartar Todas las Notificaciones",
  "attention.commandBar.toggleDebug": "Alternar Vista de Depuración",
  "attention.commandBar.togglePaths": "Alternar Mostrar Rutas",
  "attention.commandBar.toggleQueueSlots": "Alternar Ranuras de Cola",
  "attention.commandBar.togglePhaseLabels": "Alternar Etiquetas de Fase",
  "attention.commandBar.toggleObstacles": "Alternar Obstáculos",
  "attention.commandBar.noResults": "Sin comandos coincidentes",
  "attention.popup.focusTerminal": "Enfocar Terminal",
  "attention.popup.close": "Cerrar",
  "attention.popup.state": "Estado",
  "attention.popup.task": "Tarea",
  "attention.popup.type": "Tipo",
  "attention.popup.desk": "Escritorio",
  "attention.popup.boss": "Jefe",
  "attention.popup.agent": "Agente",
  "settings.commandBar": "Barra de Comandos (⌘K)",
  "settings.clickToFocus": "Clic para Enfocar",
  "settings.toastFilters": "Notificaciones Toast",
  "settings.toastAutoDismiss": "Tiempo de Auto-descarte",
  "settings.filterPermission": "Solicitudes de permiso",
  "settings.filterError": "Errores y paradas",
  "settings.filterTaskComplete": "Tareas completadas",
  "settings.filterArrival": "Llegadas de agentes",
};

export default es;
