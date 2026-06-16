export interface AgentFunction {
  id: string
  label: string
  description: string
}

export const AGENT_FUNCTIONS_REGISTRY: Record<string, AgentFunction[]> = {
  'banco-dados': [
    {
      id: 'backup-hmtrack',
      label: 'Fazer cópia do servidor HMTrack',
      description: 'Backup completo do HMTrackDB em .bak comprimido (~1.6 GB, ~34s no servidor + transferência)',
    },
  ],
}
