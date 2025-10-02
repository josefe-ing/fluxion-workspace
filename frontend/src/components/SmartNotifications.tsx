import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertTriangle, Info, DollarSign, Clock, TrendingUp } from 'lucide-react';

interface SmartNotification {
  id: string;
  type: 'opportunity' | 'warning' | 'success' | 'info';
  trigger: string; // What triggered this notification
  title: string;
  message: string;
  actionSuggestion: string;
  valueImpact?: number;
  urgency: 'low' | 'medium' | 'high';
  timestamp: Date;
  context: {
    product?: string;
    client?: string;
    supplier?: string;
    relatedData?: string;
  };
  actions: {
    primary: string;
    secondary?: string;
  };
}

const SmartNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  // Simulate real-time contextual notifications
  useEffect(() => {
    const mockNotifications: SmartNotification[] = [
      {
        id: 'SMART001',
        type: 'opportunity',
        trigger: 'Cliente realizó pedido grande',
        title: 'Oportunidad Cross-sell Detectada',
        message: 'Supermercados Líder acaba de pedir 2,000 Red Bull. Históricamente compra Snickers después.',
        actionSuggestion: 'Ofrecer bundle Red Bull + Snickers con 5% descuento',
        valueImpact: 3200,
        urgency: 'medium',
        timestamp: new Date(Date.now() - 300000), // 5 min ago
        context: {
          client: 'Supermercados Líder',
          product: 'Red Bull + Snickers',
          relatedData: 'Patrón histórico: 78% probabilidad compra conjunta'
        },
        actions: {
          primary: 'Crear Oferta',
          secondary: 'Ver Historial'
        }
      },
      {
        id: 'SMART002',
        type: 'warning',
        trigger: 'Stock crítico detectado',
        title: 'Alerta Temprana Stockout',
        message: 'Oreo alcanzará nivel crítico en 4 días si continúa demanda actual (+15% vs normal).',
        actionSuggestion: 'Activar orden emergencia o contactar clientes grandes',
        valueImpact: 25000,
        urgency: 'high',
        timestamp: new Date(Date.now() - 600000), // 10 min ago
        context: {
          product: 'Oreo Original 154g',
          supplier: 'Comercializadora Bogotá',
          relatedData: 'Lead time: 12 días, Stock actual: 2,000 unidades'
        },
        actions: {
          primary: 'Orden Emergencia',
          secondary: 'Contactar Clientes'
        }
      },
      {
        id: 'SMART003',
        type: 'success',
        trigger: 'Acción completada exitosamente',
        title: 'ROI Confirmado: Negociación Exitosa',
        message: 'Comercializadora Bogotá aceptó 10% descuento. Ahorrarás $18,000 en próxima orden.',
        actionSuggestion: 'Documentar términos y programar próxima orden',
        valueImpact: 18000,
        urgency: 'low',
        timestamp: new Date(Date.now() - 900000), // 15 min ago
        context: {
          supplier: 'Comercializadora Bogotá',
          product: 'Oreo Original 154g',
          relatedData: 'Compromiso 3 meses, descuento aplicable inmediatamente'
        },
        actions: {
          primary: 'Programar Orden',
          secondary: 'Actualizar Términos'
        }
      },
      {
        id: 'SMART004',
        type: 'info',
        trigger: 'Patrón de demanda inusual',
        title: 'Anomalía de Demanda Detectada',
        message: 'Pringles: +40% pedidos últimas 24h vs promedio. Investigar causa.',
        actionSuggestion: 'Contactar vendedores para confirmar trend real',
        urgency: 'medium',
        timestamp: new Date(Date.now() - 1200000), // 20 min ago
        context: {
          product: 'Pringles Original 165g',
          relatedData: 'Posibles causas: promoción competencia, evento especial, error sistema'
        },
        actions: {
          primary: 'Investigar',
          secondary: 'Ver Detalle'
        }
      },
      {
        id: 'SMART005',
        type: 'opportunity',
        trigger: 'Análisis de mercado',
        title: 'Ventana de Precio Favorable',
        message: 'Competencia subió precios Coca-Cola 8%. Puedes mantener precios y ganar market share.',
        actionSuggestion: 'Mantener precio actual, comunicar ventaja a fuerza ventas',
        valueImpact: 12000,
        urgency: 'high',
        timestamp: new Date(Date.now() - 1800000), // 30 min ago
        context: {
          product: 'Coca-Cola 350ml',
          relatedData: 'Competencia: Distribuidora Centro aumentó a $8.50, tu precio: $7.80'
        },
        actions: {
          primary: 'Mantener Precio',
          secondary: 'Comunicar Equipo'
        }
      }
    ];

    setNotifications(mockNotifications);
  }, []);

  const getNotificationIcon = (type: SmartNotification['type']) => {
    switch (type) {
      case 'opportunity': return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-blue-600" />;
      case 'info': return <Info className="w-5 h-5 text-gray-600" />;
    }
  };

  const getNotificationColor = (type: SmartNotification['type']) => {
    switch (type) {
      case 'opportunity': return 'bg-green-50 border-green-200';
      case 'warning': return 'bg-amber-50 border-amber-200';
      case 'success': return 'bg-blue-50 border-blue-200';
      case 'info': return 'bg-gray-50 border-gray-200';
    }
  };

  const getUrgencyIndicator = (urgency: SmartNotification['urgency']) => {
    switch (urgency) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-amber-500';
      case 'low': return 'bg-green-500';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatTimeAgo = (date: Date) => {
    const diffInMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffInMinutes < 1) return 'Ahora';
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    return `Hace ${diffInHours}h`;
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const executeAction = (notificationId: string, action: string) => {
    // Simulate action execution
    console.log(`Executing action: ${action} for notification: ${notificationId}`);
    
    // For demo purposes, just dismiss the notification
    setTimeout(() => {
      if (notificationId) {
        dismissNotification(notificationId);
      }
    }, 1000);
  };

  const highUrgencyCount = notifications.filter(n => n.urgency === 'high').length;
  const totalValue = notifications.reduce((sum, n) => sum + (n.valueImpact || 0), 0);

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-6 h-6" />
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {notifications.length}
          </span>
        )}
      </button>

      {/* Notifications Panel */}
      {isVisible && (
        <div className="absolute right-0 top-12 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Smart Notifications</h3>
                <p className="text-xs text-gray-600">
                  {highUrgencyCount} urgentes • Valor potencial: {formatCurrency(totalValue)}
                </p>
              </div>
              <button
                onClick={() => setIsVisible(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay notificaciones</p>
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg border ${getNotificationColor(notification.type)} relative`}
                  >
                    {/* Urgency indicator */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${getUrgencyIndicator(notification.urgency)}`}></div>
                    
                    <div className="flex items-start space-x-3">
                      {getNotificationIcon(notification.type)}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-semibold text-gray-900 truncate">
                            {notification.title}
                          </h4>
                          <button
                            onClick={() => dismissNotification(notification.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        
                        <p className="text-xs text-gray-700 mb-2">
                          {notification.message}
                        </p>
                        
                        <div className="text-xs text-blue-600 mb-2">
                          💡 {notification.actionSuggestion}
                        </div>
                        
                        {notification.valueImpact && (
                          <div className="text-xs text-green-600 mb-2 flex items-center space-x-1">
                            <DollarSign className="w-3 h-3" />
                            <span>Impacto: {formatCurrency(notification.valueImpact)}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatTimeAgo(notification.timestamp)}</span>
                          </div>
                          
                          <div className="flex space-x-1">
                            <button
                              onClick={() => executeAction(notification.id, notification.actions.primary)}
                              className="px-2 py-1 text-xs bg-navy-600 text-white rounded hover:bg-navy-700 transition-colors"
                            >
                              {notification.actions.primary}
                            </button>
                            {notification.actions.secondary && (
                              <button
                                onClick={() => executeAction(notification.id, notification.actions.secondary!)}
                                className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
                              >
                                {notification.actions.secondary}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setNotifications([])}
                className="w-full text-xs text-gray-600 hover:text-gray-900 transition-colors"
              >
                Marcar todas como leídas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartNotifications;