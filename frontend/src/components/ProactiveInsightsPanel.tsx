import React, { useState, useEffect } from 'react';
import { AlertCircle, TrendingUp, Bell, Clock, Zap, CheckCircle2 } from 'lucide-react';

// =====================================================================================
// TYPES & INTERFACES
// =====================================================================================

interface ProactiveInsight {
  id: string;
  triggeredBy: string;
  timestamp: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
  businessImpact: string;
  confidence: number;
  channels: string[];
  status: 'generated' | 'sent' | 'acknowledged' | 'acted_upon';
  data?: any;
}

interface InsightsStats {
  total: number;
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  averageConfidence: number;
  mostRecentUpdate: string | null;
}

// =====================================================================================
// PROACTIVE INSIGHTS PANEL COMPONENT
// =====================================================================================

const ProactiveInsightsPanel: React.FC = () => {
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [stats, setStats] = useState<InsightsStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // =====================================================================================
  // EFFECTS & EVENT LISTENERS
  // =====================================================================================

  useEffect(() => {
    // Load initial data
    fetchRecentInsights();
    fetchStats();
    
    // Setup SSE connection for real-time updates
    setupSSEConnection();
    
    // Cleanup on unmount
    return () => {
      // SSE cleanup handled by browser
    };
  }, []);

  const fetchRecentInsights = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/insights/recent?limit=20`);
      const result = await response.json();
      
      if (result.success) {
        setInsights(result.data.insights || []);
        setError(null);
      } else {
        setError('Failed to load insights');
      }
    } catch (err) {
      console.error('Error fetching insights:', err);
      setError('Connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/insights/stats`);
      const result = await response.json();
      
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const setupSSEConnection = () => {
    try {
      const eventSource = new EventSource(`${import.meta.env.VITE_API_URL}/api/insights/stream`);
      
      eventSource.onopen = () => {
        console.log('📡 Connected to insights stream');
        setIsConnected(true);
        setError(null);
      };
      
      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'insight') {
            // Add new insight to the top of the list
            setInsights(prev => [message.data, ...prev.slice(0, 19)]); // Keep max 20
            
            // Update stats
            fetchStats();
            
            // Show notification for critical/high priority insights
            if (message.data.priority === 'critical' || message.data.priority === 'high') {
              showNotification(message.data);
            }
          }
        } catch (err) {
          console.error('Error parsing SSE message:', err);
        }
      };
      
      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        setIsConnected(false);
        setError('Real-time connection lost');
        
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          setupSSEConnection();
        }, 5000);
      };
      
    } catch (err) {
      console.error('Error setting up SSE:', err);
      setError('Failed to setup real-time connection');
    }
  };

  const showNotification = (insight: ProactiveInsight) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🤖 Fluxion AI - ${insight.priority.toUpperCase()}`, {
        body: insight.title,
        icon: '/favicon.ico'
      });
    }
  };

  // =====================================================================================
  // ACTION HANDLERS
  // =====================================================================================

  const triggerDemoEvent = async (eventType: 'inventory-sync' | 'sales-spike') => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/insights/demo/${eventType}`);
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Demo event triggered: ${eventType}`);
      }
    } catch (err) {
      console.error(`Error triggering demo ${eventType}:`, err);
    }
  };

  const acknowledgeInsight = async (insightId: string) => {
    // Update insight status locally
    setInsights(prev => 
      prev.map(insight => 
        insight.id === insightId 
          ? { ...insight, status: 'acknowledged' }
          : insight
      )
    );
    
    // TODO: Send acknowledgment to backend
    console.log(`✅ Acknowledged insight: ${insightId}`);
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  };

  // =====================================================================================
  // RENDER HELPERS
  // =====================================================================================

  const getPriorityColor = (priority: string) => {
    const colors = {
      critical: 'text-red-600 bg-red-50 border-red-200',
      high: 'text-orange-600 bg-orange-50 border-orange-200',
      medium: 'text-blue-600 bg-blue-50 border-blue-200',
      low: 'text-gray-600 bg-gray-50 border-gray-200'
    };
    return colors[priority as keyof typeof colors] || colors.low;
  };

  const getPriorityIcon = (priority: string) => {
    const icons = {
      critical: <AlertCircle className="w-4 h-4" />,
      high: <Bell className="w-4 h-4" />,
      medium: <TrendingUp className="w-4 h-4" />,
      low: <Clock className="w-4 h-4" />
    };
    return icons[priority as keyof typeof icons] || icons.low;
  };

  const getTypeEmoji = (type: string) => {
    const emojis = {
      insight: '💡',
      warning: '⚠️',
      opportunity: '🎯',
      recommendation: '📋',
      info: 'ℹ️'
    };
    return emojis[type as keyof typeof emojis] || '📊';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  };

  // =====================================================================================
  // RENDER
  // =====================================================================================

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Zap className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Insights Proactivos</h2>
            <p className="text-sm text-gray-500">
              IA generando recomendaciones automáticamente
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Connection Status */}
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
            isConnected 
              ? 'bg-green-100 text-green-600' 
              : 'bg-red-100 text-red-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span>{isConnected ? 'En línea' : 'Desconectado'}</span>
          </div>
          
          {/* Notification Permission */}
          {!('Notification' in window) ? null : 
            Notification.permission === 'default' ? (
              <button
                onClick={requestNotificationPermission}
                className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full hover:bg-blue-200"
              >
                Activar notificaciones
              </button>
            ) : null
          }
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.byPriority.critical}</div>
            <div className="text-xs text-gray-500">Críticos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.byPriority.high}</div>
            <div className="text-xs text-gray-500">Altos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {Math.round(stats.averageConfidence * 100)}%
            </div>
            <div className="text-xs text-gray-500">Confianza</div>
          </div>
        </div>
      )}

      {/* Demo Buttons */}
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => triggerDemoEvent('inventory-sync')}
          className="flex-1 px-3 py-2 bg-blue-100 text-blue-600 text-xs rounded-lg hover:bg-blue-200"
        >
          🔄 Demo: Sync Inventario
        </button>
        <button
          onClick={() => triggerDemoEvent('sales-spike')}
          className="flex-1 px-3 py-2 bg-green-100 text-green-600 text-xs rounded-lg hover:bg-green-200"
        >
          📈 Demo: Pico Ventas
        </button>
      </div>

      {/* Insights List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-red-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No hay insights recientes</p>
            <p className="text-xs mt-1">Prueba los botones de demo arriba</p>
          </div>
        ) : (
          insights.map((insight) => (
            <div
              key={insight.id}
              className={`border rounded-lg p-4 ${getPriorityColor(insight.priority)}`}
            >
              {/* Insight Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {getPriorityIcon(insight.priority)}
                  <span className="text-sm font-medium">
                    {getTypeEmoji(insight.type)} {insight.title}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-xs opacity-75">
                    {formatTimestamp(insight.timestamp)}
                  </span>
                  
                  {insight.status !== 'acknowledged' && (
                    <button
                      onClick={() => acknowledgeInsight(insight.id)}
                      className="text-xs opacity-75 hover:opacity-100"
                      title="Marcar como visto"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Insight Content */}
              <div className="text-sm space-y-2">
                <p>{insight.description}</p>
                
                <div className="bg-white bg-opacity-50 rounded p-2">
                  <div className="font-medium text-xs mb-1">💡 Recomendación:</div>
                  <p className="text-xs">{insight.recommendation}</p>
                </div>
                
                {insight.businessImpact && (
                  <div className="bg-white bg-opacity-50 rounded p-2">
                    <div className="font-medium text-xs mb-1">📈 Impacto:</div>
                    <p className="text-xs">{insight.businessImpact}</p>
                  </div>
                )}
              </div>

              {/* Insight Footer */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-current border-opacity-20">
                <div className="flex items-center space-x-3 text-xs opacity-75">
                  <span>Confianza: {Math.round(insight.confidence * 100)}%</span>
                  <span>•</span>
                  <span>Trigger: {insight.triggeredBy}</span>
                </div>
                
                <div className="flex space-x-1">
                  {insight.channels.map(channel => (
                    <span key={channel} className="text-xs px-1 py-0.5 bg-white bg-opacity-50 rounded">
                      {channel === 'whatsapp' ? '📱' : 
                       channel === 'email' ? '📧' : 
                       channel === 'dashboard' ? '📊' : '🔗'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProactiveInsightsPanel;