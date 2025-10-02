import React, { useState, useEffect } from 'react';
import { Bot, AlertTriangle, Lightbulb, BarChart3, Clock, ChevronDown, ChevronUp, X, MessageSquare, Send, Sparkles, Target, Zap, Calendar, Phone, Users, QrCode, CheckCircle } from 'lucide-react';
import { mockAlerts, mockChatMessages, chatSuggestions } from '../data/mockData';
import type { InventoryAlert, ChatMessage, ChatSuggestion } from '../types';

interface AIAgentPanelProps {
  newAlertsCount: number;
  onClearNewAlerts: () => void;
}

const AIAgentPanel: React.FC<AIAgentPanelProps> = ({ newAlertsCount, onClearNewAlerts }) => {
  const [alerts, setAlerts] = useState<InventoryAlert[]>(mockAlerts);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [processedActions, setProcessedActions] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'alerts' | 'chat' | 'whatsapp'>('alerts');
  const [alertsView, setAlertsView] = useState<'all' | 'tactical' | 'strategic'>('all');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(mockChatMessages);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // Simulate new alerts arriving
  useEffect(() => {
    if (newAlertsCount > 0) {
      const newAlert: InventoryAlert = {
        id: `new-${Date.now()}`,
        type: 'insight',
        title: 'Nuevo Patrón Detectado',
        message: 'Aumento 30% pedidos dulces navideños. Considerar anticipar stock para Diciembre.',
        timestamp: 'Ahora',
        priority: 'medium',
        actions: ['Analizar Trend', 'Ver Predicción', 'Dismiss'],
        isNew: true,
        decisionType: 'strategic',
        timeframe: '2-3 meses',
        impact: 'short-term'
      };
      
      setAlerts(prev => [newAlert, ...prev]);
      
      // Remove "new" status after 5 seconds
      setTimeout(() => {
        setAlerts(prev => prev.map(alert => 
          alert.id === newAlert.id ? { ...alert, isNew: false } : alert
        ));
      }, 5000);
      
      onClearNewAlerts();
    }
  }, [newAlertsCount, onClearNewAlerts]);

  const getAlertIcon = (type: InventoryAlert['type']) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-danger-600" />;
      case 'opportunity':
        return <Lightbulb className="w-5 h-5 text-amber-600" />;
      case 'insight':
        return <BarChart3 className="w-5 h-5 text-blue-600" />;
      default:
        return <BarChart3 className="w-5 h-5 text-blue-600" />;
    }
  };

  const getAlertStyle = (type: InventoryAlert['type']) => {
    switch (type) {
      case 'critical':
        return 'alert-critical';
      case 'opportunity':
        return 'alert-opportunity';
      case 'insight':
        return 'alert-insight';
      default:
        return 'alert-insight';
    }
  };

  const getPriorityColor = (priority: InventoryAlert['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-danger-100 text-danger-800';
      case 'medium':
        return 'bg-amber-100 text-amber-800';
      case 'low':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDecisionTypeColor = (decisionType: 'tactical' | 'strategic') => {
    return decisionType === 'tactical' 
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-blue-50 border-blue-200 text-blue-800';
  };

  const getDecisionTypeIcon = (decisionType: 'tactical' | 'strategic') => {
    return decisionType === 'tactical' 
      ? <Zap className="w-4 h-4" />
      : <Target className="w-4 h-4" />;
  };

  const filteredAlerts = alerts.filter(alert => {
    if (alertsView === 'all') return true;
    return alert.decisionType === alertsView;
  });

  const filteredChatMessages = chatMessages.filter(message => {
    if (alertsView === 'all') return true;
    if (!message.decisionType) return false;
    return message.decisionType === alertsView;
  });

  const handleAction = (alertId: string, action: string) => {
    setProcessedActions(prev => new Set([...prev, `${alertId}-${action}`]));
    
    // Simulate action feedback
    setTimeout(() => {
      if (action.includes('Ver') || action.includes('Analizar')) {
        // Just show feedback, don't remove alert
      } else if (action.includes('Dismiss') || action.includes('Snooze')) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      }
    }, 1000);
  };

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const toggleExpanded = (alertId: string) => {
    setExpandedAlert(expandedAlert === alertId ? null : alertId);
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      message: newMessage,
      timestamp: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      type: 'text'
    };

    setChatMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        'Analizando tu consulta... Dame un momento para revisar los datos más recientes.',
        'Perfecto, aquí tienes la información que necesitas sobre tu inventario.',
        'Interesante pregunta. Basado en los patrones actuales, puedo darte esta recomendación.',
        'Excelente timing para esa pregunta. Los datos muestran una oportunidad importante.'
      ];

      const agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        message: responses[Math.floor(Math.random() * responses.length)],
        timestamp: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        type: 'text'
      };

      setChatMessages(prev => [...prev, agentMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const handleSuggestionClick = (suggestion: ChatSuggestion) => {
    setNewMessage(suggestion.text);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="card h-fit sticky top-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-navy-900 rounded-lg flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy-900">FLUXION AGENT</h2>
            <p className="text-sm text-gray-500">Inteligencia Proactiva</p>
          </div>
        </div>
        <div className="w-3 h-3 bg-success-500 rounded-full animate-pulse-gentle"></div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'alerts'
              ? 'bg-white text-navy-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Alertas</span>
          {alerts.filter(a => a.isNew).length > 0 && (
            <div className="w-2 h-2 bg-danger-500 rounded-full"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-white text-navy-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat</span>
          <Sparkles className="w-3 h-3 text-amber-500" />
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'whatsapp'
              ? 'bg-white text-navy-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Phone className="w-4 h-4" />
          <span>WhatsApp</span>
          <div className="w-2 h-2 bg-green-500 rounded-full" title="Bot Activo"></div>
        </button>
      </div>

      {/* Decision Type Filter */}
      <div className="flex space-x-1 mb-4 p-2 bg-gray-50 rounded-lg">
        <button
          onClick={() => setAlertsView('all')}
          className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
            alertsView === 'all'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setAlertsView('tactical')}
          className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center space-x-1 ${
            alertsView === 'tactical'
              ? 'bg-red-100 text-red-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Zap className="w-3 h-3" />
          <span>Tácticas</span>
        </button>
        <button
          onClick={() => setAlertsView('strategic')}
          className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center space-x-1 ${
            alertsView === 'strategic'
              ? 'bg-blue-100 text-blue-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Target className="w-3 h-3" />
          <span>Estratégicas</span>
        </button>
      </div>

      {activeTab === 'alerts' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-danger-600">{alerts.filter(a => a.type === 'critical').length}</div>
              <div className="text-xs text-gray-500">Críticos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{alerts.filter(a => a.type === 'opportunity').length}</div>
              <div className="text-xs text-gray-500">Oportunidades</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{alerts.filter(a => a.type === 'insight').length}</div>
              <div className="text-xs text-gray-500">Insights</div>
            </div>
          </div>

          {/* Alerts Feed */}
          <div className="space-y-4 max-h-96 overflow-y-auto">
        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`${getAlertStyle(alert.type)} ${alert.isNew ? 'animate-slide-in' : ''} transition-all duration-200`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                {getAlertIcon(alert.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {alert.title}
                    </h3>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2 leading-relaxed">
                    {alert.message}
                  </p>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">{alert.timestamp}</span>
                      {alert.isNew && (
                        <span className="text-xs bg-success-100 text-success-800 px-2 py-1 rounded-full font-medium">
                          Nuevo
                        </span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPriorityColor(alert.priority)}`}>
                      {alert.priority === 'high' ? 'Alta' : alert.priority === 'medium' ? 'Media' : 'Baja'}
                    </span>
                  </div>
                  
                  {/* Decision Type and Timeframe */}
                  <div className="flex items-center space-x-2 mb-3">
                    <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${getDecisionTypeColor(alert.decisionType)}`}>
                      {getDecisionTypeIcon(alert.decisionType)}
                      <span>{alert.decisionType === 'tactical' ? 'Táctica' : 'Estratégica'}</span>
                    </span>
                    <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                      <Calendar className="w-3 h-3" />
                      <span>{alert.timeframe}</span>
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    {expandedAlert === alert.id ? (
                      <div className="grid grid-cols-1 gap-2">
                        {alert.actions.map((action, index) => (
                          <button
                            key={index}
                            onClick={() => handleAction(alert.id, action)}
                            disabled={processedActions.has(`${alert.id}-${action}`)}
                            className={`text-xs px-3 py-2 rounded-md font-medium transition-colors duration-200 ${
                              processedActions.has(`${alert.id}-${action}`)
                                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {processedActions.has(`${alert.id}-${action}`) ? '✓ Procesado' : action}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAction(alert.id, alert.actions[0])}
                        disabled={processedActions.has(`${alert.id}-${alert.actions[0]}`)}
                        className={`text-xs px-3 py-2 rounded-md font-medium transition-colors duration-200 ${
                          processedActions.has(`${alert.id}-${alert.actions[0]}`)
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'bg-navy-900 text-white hover:bg-navy-800'
                        }`}
                      >
                        {processedActions.has(`${alert.id}-${alert.actions[0]}`) ? '✓ Procesado' : alert.actions[0]}
                      </button>
                    )}
                    
                    {alert.actions.length > 1 && (
                      <button
                        onClick={() => toggleExpanded(alert.id)}
                        className="flex items-center space-x-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {expandedAlert === alert.id ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            <span>Menos opciones</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            <span>{alert.actions.length - 1} opciones más</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
          </div>
        </>
      )}

      {activeTab === 'chat' && (
        <div className="flex flex-col h-96">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {(alertsView === 'all' ? chatMessages : filteredChatMessages).map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    message.sender === 'user'
                      ? 'bg-navy-900 text-white'
                      : message.type === 'tactical'
                      ? 'bg-red-50 text-red-900 border border-red-200'
                      : message.type === 'strategic'
                      ? 'bg-blue-50 text-blue-900 border border-blue-200'
                      : message.type === 'data'
                      ? 'bg-green-50 text-green-900 border border-green-200'
                      : message.type === 'suggestion'
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.message}</div>
                  <div className="flex items-center justify-between mt-2">
                    <div className={`text-xs ${
                      message.sender === 'user' ? 'text-blue-200' : 'text-gray-500'
                    }`}>
                      {message.timestamp}
                    </div>
                    {message.decisionType && (
                      <div className="flex items-center space-x-1">
                        <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs ${
                          message.decisionType === 'tactical' 
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {getDecisionTypeIcon(message.decisionType)}
                          <span>{message.decisionType === 'tactical' ? 'Táctica' : 'Estratégica'}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 rounded-lg px-3 py-2 text-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestions */}
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-2">Sugerencias rápidas:</div>
            <div className="flex flex-wrap gap-2">
              {chatSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Input */}
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Pregúntale al Fluxion Agent..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                rows={2}
                disabled={isTyping}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isTyping}
              className="btn-primary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {activeTab === 'whatsapp' && (
        <WhatsAppBotStatus />
      )}
    </div>
  );
};

// WhatsApp Bot Status Component
const WhatsAppBotStatus: React.FC = () => {
  const [showQRCode, setShowQRCode] = useState(false);
  const [connectedUsers] = useState([
    { name: 'Freddy Da Silva', phone: '+58 412-123-4567', lastActive: '5 min ago', status: 'active' },
    { name: 'María González', phone: '+58 424-987-6543', lastActive: '1 hour ago', status: 'active' },
    { name: 'Carlos Rodríguez', phone: '+58 416-555-7890', lastActive: '3 hours ago', status: 'active' }
  ]);

  const [recentConversations] = useState([
    {
      id: '1',
      user: 'Freddy Da Silva',
      lastMessage: '¿Cómo está el stock de Savoy Tango?',
      response: 'Stock crítico: 450 unidades. Recomiendo orden urgente de 50,000 unidades.',
      timestamp: '10:30 AM',
      type: 'inventory'
    },
    {
      id: '2', 
      user: 'María González',
      lastMessage: '¿Cuáles son las ventas de hoy?',
      response: 'Ventas del día: $12,450. 15% por encima del promedio.',
      timestamp: '9:45 AM',
      type: 'sales'
    },
    {
      id: '3',
      user: 'Carlos Rodríguez', 
      lastMessage: '¿Cuándo llega el próximo contenedor de chocolates?',
      response: 'Contenedor Savoy programado para 25 agosto. Lead time: 11 días.',
      timestamp: '8:20 AM',
      type: 'logistics'
    }
  ]);

  const botStats = {
    dailyQueries: 47,
    responseTime: '2.3s',
    accuracy: '94%',
    uptime: '99.8%'
  };

  return (
    <div className="space-y-4">
      {/* Bot Status Header */}
      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-green-900">Bot WhatsApp Activo</div>
            <div className="text-sm text-green-700">Fluxion Agent • +58 414-FLUXION</div>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700">Conectado</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-lg font-bold text-blue-900">{botStats.dailyQueries}</div>
          <div className="text-xs text-blue-700">Consultas Hoy</div>
        </div>
        <div className="text-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="text-lg font-bold text-purple-900">{botStats.responseTime}</div>
          <div className="text-xs text-purple-700">Tiempo Respuesta</div>
        </div>
        <div className="text-center p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-lg font-bold text-amber-900">{botStats.accuracy}</div>
          <div className="text-xs text-amber-700">Precisión</div>
        </div>
        <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-lg font-bold text-green-900">{botStats.uptime}</div>
          <div className="text-xs text-green-700">Disponibilidad</div>
        </div>
      </div>

      {/* Connected Users */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
            <Users className="w-4 h-4" />
            <span>Usuarios Conectados ({connectedUsers.length})</span>
          </div>
          <button
            onClick={() => setShowQRCode(!showQRCode)}
            className="text-xs px-2 py-1 bg-navy-600 text-white rounded-md hover:bg-navy-700 transition-colors"
          >
            <QrCode className="w-3 h-3 inline mr-1" />
            QR Code
          </button>
        </div>
        
        <div className="space-y-2">
          {connectedUsers.map((user, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-navy-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {user.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.phone}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-green-600">● Activo</div>
                <div className="text-xs text-gray-500">{user.lastActive}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQRCode && (
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-900 mb-3">Conectar Nuevo Usuario</div>
            <div className="w-32 h-32 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-3">
              <QrCode className="w-16 h-16 text-gray-400" />
            </div>
            <div className="text-xs text-gray-600">
              Escanea con WhatsApp para conectarte con Fluxion Agent
            </div>
            <div className="text-xs text-navy-600 mt-1">
              wa.me/58414FLUXION
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Preview */}
      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">Vista Previa Mobile</div>
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-gray-200">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <Phone className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm">Fluxion Agent</div>
                <div className="text-xs text-green-600">● En línea</div>
              </div>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="bg-gray-100 rounded-lg p-2">
                <strong>Tú:</strong> ¿Cómo está el stock de Savoy Tango?
              </div>
              <div className="bg-blue-500 text-white rounded-lg p-2">
                <strong>Fluxion:</strong> 🚨 Stock crítico: 450 unidades restantes<br/>
                📈 Recomiendo orden urgente de 50,000 unidades<br/>
                🚢 Lead time: 15 días (Savoy Venezuela)<br/>
                💰 Costo estimado: $210,000
              </div>
              <div className="bg-gray-100 rounded-lg p-2">
                <strong>Tú:</strong> Ok, créala orden
              </div>
              <div className="bg-blue-500 text-white rounded-lg p-2">
                <strong>Fluxion:</strong> ✅ Orden creada: #ORD-2024-0814<br/>
                📋 50,000 Savoy Tango 20g<br/>
                🏭 Proveedor: Savoy Venezuela<br/>
                📅 Entrega estimada: 29 Agosto
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Conversations */}
      <div>
        <div className="text-sm font-semibold text-gray-900 mb-3 flex items-center space-x-2">
          <MessageSquare className="w-4 h-4" />
          <span>Conversaciones Recientes</span>
        </div>
        
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {recentConversations.map((conversation) => (
            <div key={conversation.id} className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm text-gray-900">{conversation.user}</div>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    conversation.type === 'inventory' ? 'bg-blue-100 text-blue-700' :
                    conversation.type === 'sales' ? 'bg-green-100 text-green-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {conversation.type}
                  </span>
                  <span className="text-xs text-gray-500">{conversation.timestamp}</span>
                </div>
              </div>
              
              <div className="text-xs text-gray-700 mb-1">
                <strong>Pregunta:</strong> {conversation.lastMessage}
              </div>
              <div className="text-xs text-navy-700">
                <strong>Fluxion:</strong> {conversation.response}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIAgentPanel;