import { create } from 'zustand'
import type { LiveAgent } from '../types'

interface TrackingState {
  liveAgents: Record<number, LiveAgent>
  updateAgent: (agentId: number, data: Partial<LiveAgent>) => void
  setLiveAgents: (agents: LiveAgent[]) => void
  removeAgent: (agentId: number) => void
}

export const useTrackingStore = create<TrackingState>((set) => ({
  liveAgents: {},

  updateAgent: (agentId, data) =>
    set((state) => ({
      liveAgents: {
        ...state.liveAgents,
        [agentId]: { ...(state.liveAgents[agentId] || {}), ...data, agent_id: agentId } as LiveAgent,
      },
    })),

  setLiveAgents: (agents) => {
    const map: Record<number, LiveAgent> = {}
    agents.forEach((a) => (map[a.agent_id] = a))
    set({ liveAgents: map })
  },

  removeAgent: (agentId) =>
    set((state) => {
      const next = { ...state.liveAgents }
      delete next[agentId]
      return { liveAgents: next }
    }),
}))
