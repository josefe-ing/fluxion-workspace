import React, { useState } from 'react';
import { Target, Clock, DollarSign, AlertTriangle, CheckCircle2, Phone, Package, TrendingUp } from 'lucide-react';

interface DailyAction {
  id: string;
  type: 'critical' | 'opportunity' | 'optimization';
  title: string;
  description: string;
  valueImpact: number; // Potential $ impact
  timeRequired: string; // "5 min", "1 hora"
  deadline: string; // "Hoy 2:00 PM", "Mañana"
  action: string; // What specifically to do
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  category: 'sales' | 'inventory' | 'supplier' | 'client';
}

const DailyActionCenter: React.FC = () => {
  const [actions, setActions] = useState<DailyAction[]>([
    {
      id: 'ACT001',
      type: 'critical',
      title: 'Llamar Distribuidora Zulia URGENTE',
      description: '15 días overdue. Patrón histórico indica 85% probabilidad pérdida cliente.',
      valueImpact: 15000,
      timeRequired: '10 min',
      deadline: 'Hoy 11:00 AM',
      action: 'Llamar +58 261-xxx-xxxx y ofrecer descuento 5% por pago inmediato',
      status: 'pending',
      category: 'client'
    },
    {
      id: 'ACT002',
      type: 'critical',
      title: 'Aprobar Orden Pringles 20K',
      description: 'Stockout en 8 días. Múltiples clientes esperando. Mínimo proveedor 20K.',
      valueImpact: 180000,
      timeRequired: '2 min',
      deadline: 'Hoy 12:00 PM',
      action: 'Aprobar orden PO-2024-156 por $210,000 a Kellogg Miami',
      status: 'pending',
      category: 'inventory'
    },
    {
      id: 'ACT003',
      type: 'opportunity',
      title: 'Negociar Descuento Colombia',
      description: 'Comercializadora Bogotá ofrece 8% descuento por volumen en Oreo.',
      valueImpact: 18000,
      timeRequired: '15 min',
      deadline: 'Hoy 5:00 PM',
      action: 'Contra-oferta: 10% descuento por compromiso 3 meses',
      status: 'pending',
      category: 'supplier'
    },
    {
      id: 'ACT004',
      type: 'optimization',
      title: 'Liberar Inventario Red Bull',
      description: '68% stock bloqueado vs 15% normal. Acelerar despachos.',
      valueImpact: 12000,
      timeRequired: '5 min',
      deadline: 'Hoy 3:00 PM',
      action: 'Autorizar despacho extraordinario - Contactar logística',
      status: 'pending',
      category: 'inventory'
    },
    {
      id: 'ACT005',
      type: 'opportunity',
      title: 'Capturar Demanda Snickers',
      description: 'Competencia con stockout. Oportunidad aumentar precio 3%.',
      valueImpact: 8500,
      timeRequired: '3 min',
      deadline: 'Mañana 9:00 AM',
      action: 'Actualizar lista precios Snickers: $7.50 → $7.72',
      status: 'pending',
      category: 'sales'
    }
  ]);

  const [completedValue, setCompletedValue] = useState(67500); // Value generated this week

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getActionIcon = (type: DailyAction['type']) => {
    switch (type) {
      case 'critical': return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'opportunity': return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'optimization': return <Target className="w-5 h-5 text-blue-600" />;
    }
  };

  const getCategoryIcon = (category: DailyAction['category']) => {
    switch (category) {
      case 'client': return <Phone className="w-4 h-4" />;
      case 'inventory': return <Package className="w-4 h-4" />;
      case 'supplier': return <DollarSign className="w-4 h-4" />;
      case 'sales': return <TrendingUp className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: DailyAction['type']) => {
    switch (type) {
      case 'critical': return 'bg-red-50 border-red-200';
      case 'opportunity': return 'bg-green-50 border-green-200';
      case 'optimization': return 'bg-blue-50 border-blue-200';
    }
  };

  const markAsCompleted = (actionId: string) => {
    setActions(prev => prev.map(action => 
      action.id === actionId 
        ? { ...action, status: 'completed' }
        : action
    ));
    
    const action = actions.find(a => a.id === actionId);
    if (action) {
      setCompletedValue(prev => prev + action.valueImpact);
    }
  };

  const markAsInProgress = (actionId: string) => {
    setActions(prev => prev.map(action => 
      action.id === actionId 
        ? { ...action, status: 'in_progress' }
        : action
    ));
  };

  const pendingActions = actions.filter(a => a.status === 'pending');
  const inProgressActions = actions.filter(a => a.status === 'in_progress');
  const todayValue = pendingActions.reduce((sum, action) => sum + action.valueImpact, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Buenos días, Freddy 👋</h2>
          <p className="text-gray-600">Tienes {pendingActions.length} acciones que pueden generar {formatCurrency(todayValue)} hoy</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Valor generado esta semana</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(completedValue)}</div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="font-semibold text-red-900">Críticas</span>
          </div>
          <div className="text-2xl font-bold text-red-900">
            {actions.filter(a => a.type === 'critical' && a.status === 'pending').length}
          </div>
          <div className="text-sm text-red-700">Requieren atención inmediata</div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-900">Oportunidades</span>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {formatCurrency(actions.filter(a => a.type === 'opportunity' && a.status === 'pending').reduce((sum, a) => sum + a.valueImpact, 0))}
          </div>
          <div className="text-sm text-green-700">Valor disponible hoy</div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-blue-900">En Progreso</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{inProgressActions.length}</div>
          <div className="text-sm text-blue-700">Acciones activas</div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Tu Lista de Acciones Hoy</h3>
        
        {actions.filter(a => a.status !== 'completed').map((action) => (
          <div
            key={action.id}
            className={`card ${getTypeColor(action.type)} ${
              action.status === 'in_progress' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  {getActionIcon(action.type)}
                  <h4 className="font-semibold text-gray-900">{action.title}</h4>
                  <div className="flex items-center space-x-1 text-gray-500">
                    {getCategoryIcon(action.category)}
                    <span className="text-xs capitalize">{action.category}</span>
                  </div>
                </div>
                
                <p className="text-sm text-gray-700 mb-3">{action.description}</p>
                
                <div className="bg-white/50 rounded-lg p-3 mb-3">
                  <div className="font-medium text-gray-900 text-sm mb-1">Acción Específica:</div>
                  <div className="text-sm text-gray-700">{action.action}</div>
                </div>

                <div className="flex items-center space-x-4 text-xs text-gray-600">
                  <div className="flex items-center space-x-1">
                    <DollarSign className="w-3 h-3" />
                    <span>Impacto: {formatCurrency(action.valueImpact)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>Tiempo: {action.timeRequired}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Deadline: {action.deadline}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col space-y-2 ml-4">
                {action.status === 'pending' && (
                  <>
                    <button
                      onClick={() => markAsInProgress(action.id)}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Iniciar
                    </button>
                    <button
                      onClick={() => markAsCompleted(action.id)}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      ✓ Hecho
                    </button>
                  </>
                )}
                
                {action.status === 'in_progress' && (
                  <button
                    onClick={() => markAsCompleted(action.id)}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center space-x-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Completar</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Daily Summary */}
      <div className="bg-gradient-to-r from-navy-500 to-navy-600 rounded-lg p-6 text-white">
        <h3 className="text-lg font-semibold mb-2">Resumen del Día</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold">{pendingActions.length}</div>
            <div className="text-sm opacity-90">Acciones pendientes</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{formatCurrency(todayValue)}</div>
            <div className="text-sm opacity-90">Valor potencial hoy</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {Math.round(actions.filter(a => a.status === 'completed').length / actions.length * 100)}%
            </div>
            <div className="text-sm opacity-90">Efectividad esta semana</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyActionCenter;