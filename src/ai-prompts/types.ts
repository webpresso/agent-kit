export const AGENT_PERSONAS = ['steve', 'rachel', 'ozby', 'volker', 'jeramy', 'rodrigo'] as const

export type AgentPersona = (typeof AGENT_PERSONAS)[number]
