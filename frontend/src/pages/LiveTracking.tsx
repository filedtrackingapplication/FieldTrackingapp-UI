import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { trackingApi } from '../services/api'
import { trackingWS } from '../services/websocket'
import { useTrackingStore } from '../store/trackingStore'
import { useAuthStore } from '../store/authStore'
import type { LiveAgent } from '../types'
import { RefreshCw, Navigation } from 'lucide-react'

// Custom truck icon
const truckIcon = (online: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${online ? '#22c55e' : '#94a3b8'};width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;">🚚</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })

export default function LiveTracking() {
  const { liveAgents, updateAgent, setLiveAgents } = useTrackingStore()
  const { user, token } = useAuthStore()
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null)
  const [routeHistory, setRouteHistory] = useState<[number, number][]>([])
  const mapRef = useRef<any>(null)

  const agents = Object.values(liveAgents)

  // Load initial live agents
  useEffect(() => {
    trackingApi.live().then((res) => setLiveAgents(res.data))
  }, [setLiveAgents])

  // Connect dashboard WebSocket to receive real-time updates
  useEffect(() => {
    if (!user || !token) return
    trackingWS.connectDashboard(user.id, token, (msg: any) => {
      if (msg.type === 'location_update') {
        updateAgent(msg.data.agent_id, msg.data)
      }
    })
    return () => trackingWS.disconnect()
  }, [user, token, updateAgent])

  const handleSelectAgent = async (agentId: number) => {
    setSelectedAgent(agentId)
    const res = await trackingApi.history(agentId, { limit: 100 })
    const coords: [number, number][] = res.data.map((l: any) => [l.latitude, l.longitude])
    setRouteHistory(coords)
    const agent = liveAgents[agentId]
    if (agent?.latitude && agent?.longitude && mapRef.current) {
      mapRef.current.flyTo([agent.latitude, agent.longitude], 14)
    }
  }

  const defaultCenter: [number, number] = [20.5937, 78.9629] // India

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* Agents Panel */}
      <div className="w-72 card flex flex-col overflow-hidden p-0">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Live Agents ({agents.length})</h2>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {agents.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">No agents online</p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.agent_id}
                onClick={() => handleSelectAgent(agent.agent_id)}
                className={`w-full text-left p-3 hover:bg-blue-50 transition-colors ${selectedAgent === agent.agent_id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚚</span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{agent.full_name}</p>
                    <p className="text-xs text-gray-500">{agent.vehicle_number || 'No vehicle'}</p>
                    {agent.speed !== undefined && (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <Navigation className="w-3 h-3" /> {agent.speed?.toFixed(1)} km/h
                      </p>
                    )}
                    {agent.address && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{agent.address}</p>
                    )}
                  </div>
                  <span className={`ml-auto w-2.5 h-2.5 rounded-full shrink-0 ${agent.latitude ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 rounded-xl overflow-hidden shadow-sm border border-gray-200">
        <MapContainer
          center={defaultCenter}
          zoom={5}
          className="w-full h-full"
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Route polyline for selected agent */}
          {selectedAgent && routeHistory.length > 1 && (
            <Polyline positions={routeHistory} color="#3b82f6" weight={3} opacity={0.7} dashArray="8,4" />
          )}

          {/* Agent markers */}
          {agents.map((agent) =>
            agent.latitude && agent.longitude ? (
              <Marker
                key={agent.agent_id}
                position={[agent.latitude, agent.longitude]}
                icon={truckIcon(true)}
                eventHandlers={{ click: () => handleSelectAgent(agent.agent_id) }}
              >
                <Popup>
                  <div className="text-sm min-w-[160px]">
                    <p className="font-semibold">{agent.full_name}</p>
                    <p className="text-gray-500 text-xs">{agent.vehicle_number}</p>
                    <p className="text-gray-500 text-xs">{agent.assigned_zone || 'No zone'}</p>
                    {agent.speed !== undefined && <p className="text-blue-600 text-xs">{agent.speed?.toFixed(1)} km/h</p>}
                    {agent.address && <p className="text-gray-400 text-xs mt-1">{agent.address}</p>}
                    {agent.last_seen && (
                      <p className="text-gray-300 text-xs mt-1">
                        {new Date(agent.last_seen).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}
        </MapContainer>
      </div>
    </div>
  )
}
