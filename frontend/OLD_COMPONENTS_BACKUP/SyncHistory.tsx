import React, { useState } from 'react';
import { Clock, CheckCircle, XCircle, AlertTriangle, Download, Filter, Search, User, Calendar } from 'lucide-react';
import { SyncHistoryRecord } from '../types';

const SyncHistory: React.FC = () => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'success' | 'error' | 'partial'>('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [searchTerm, setSearchTerm] = useState('');

  const syncHistory: SyncHistoryRecord[] = [
    {
      id: 'SYNC_240814_0600',
      timestamp: '2024-08-14T06:00:12Z',
      type: 'scheduled',
      status: 'success',
      duration: 2340,
      recordsUpdated: {
        inventory: 1240,
        sales: 89,
        suppliers: 4,
        clients: 12
      },
      triggeredBy: 'system',
      summary: 'Sincronización programada completada exitosamente. Actualizados movimientos de inventario nocturno y nuevas órdenes.'
    },
    {
      id: 'SYNC_240813_1530',
      timestamp: '2024-08-13T15:30:45Z',
      type: 'manual',
      status: 'success',
      duration: 1890,
      recordsUpdated: {
        inventory: 567,
        sales: 45,
        suppliers: 0,
        clients: 8
      },
      triggeredBy: 'freddy.silva@distribuidora.com',
      summary: 'Sincronización manual solicitada por usuario. Procesadas ventas de la tarde y ajustes de stock.'
    },
    {
      id: 'SYNC_240813_0600',
      timestamp: '2024-08-13T06:00:08Z',
      type: 'scheduled',
      status: 'partial',
      duration: 3120,
      recordsUpdated: {
        inventory: 1156,
        sales: 78,
        suppliers: 4,
        clients: 0
      },
      warnings: [
        'Timeout en conexión con sistema de clientes',
        '3 registros de inventario con inconsistencias'
      ],
      triggeredBy: 'system',
      summary: 'Sincronización parcial. Completado inventario y ventas. Error temporal en sistema de clientes, reintentar manualmente.'
    },
    {
      id: 'SYNC_240812_1445',
      timestamp: '2024-08-12T14:45:23Z',
      type: 'manual',
      status: 'error',
      duration: 450,
      recordsUpdated: {
        inventory: 0,
        sales: 0,
        suppliers: 0,
        clients: 0
      },
      errors: [
        'Error de conexión con servidor principal',
        'Timeout en autenticación API'
      ],
      triggeredBy: 'admin@distribuidora.com',
      summary: 'Fallo en sincronización por problemas de conectividad. Sistema principal no disponible.'
    },
    {
      id: 'SYNC_240812_0600',
      timestamp: '2024-08-12T06:00:15Z',
      type: 'scheduled',
      status: 'success',
      duration: 2180,
      recordsUpdated: {
        inventory: 1334,
        sales: 156,
        suppliers: 2,
        clients: 15
      },
      triggeredBy: 'system',
      summary: 'Sincronización exitosa. Actualización completa de todos los módulos. Procesadas órdenes de fin de semana.'
    },
    {
      id: 'SYNC_240811_1820',
      timestamp: '2024-08-11T18:20:34Z',
      type: 'manual',
      status: 'success',
      duration: 1670,
      recordsUpdated: {
        inventory: 445,
        sales: 23,
        suppliers: 1,
        clients: 4
      },
      triggeredBy: 'freddy.silva@distribuidora.com',
      summary: 'Actualización de inventario post-recepción. Nuevo lote de Pringles agregado al sistema.'
    }
  ];

  const getStatusColor = (status: SyncHistoryRecord['status']) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50 border-green-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'partial': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: SyncHistoryRecord['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      case 'partial': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };


  const filteredHistory = syncHistory
    .filter(record => selectedFilter === 'all' || record.status === selectedFilter)
    .filter(record => {
      if (searchTerm.trim() === '') return true;
      return record.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
             record.triggeredBy.toLowerCase().includes(searchTerm.toLowerCase());
    });

  const stats = {
    total: syncHistory.length,
    success: syncHistory.filter(r => r.status === 'success').length,
    error: syncHistory.filter(r => r.status === 'error').length,
    partial: syncHistory.filter(r => r.status === 'partial').length,
    averageDuration: Math.round(syncHistory.reduce((sum, r) => sum + r.duration, 0) / syncHistory.length / 1000)
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total</div>
        </div>
        
        <div className="bg-white border border-green-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.success}</div>
          <div className="text-sm text-green-700">Exitosas</div>
        </div>
        
        <div className="bg-white border border-amber-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.partial}</div>
          <div className="text-sm text-amber-700">Parciales</div>
        </div>
        
        <div className="bg-white border border-red-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.error}</div>
          <div className="text-sm text-red-700">Errores</div>
        </div>
        
        <div className="bg-white border border-blue-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.averageDuration}s</div>
          <div className="text-sm text-blue-700">Promedio</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="all">Todas</option>
                <option value="success">Exitosas</option>
                <option value="partial">Parciales</option>
                <option value="error">Errores</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              >
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
                <option value="all">Todas</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar en historial..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
            
            <button className="flex items-center space-x-2 px-4 py-2 bg-navy-600 text-white rounded-md hover:bg-navy-700 transition-colors">
              <Download className="w-4 h-4" />
              <span>Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {filteredHistory.map((record) => (
          <div key={record.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-4">
              {/* Status Indicator */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center ${getStatusColor(record.status)}`}>
                {getStatusIcon(record.status)}
              </div>
              
              {/* Main Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Sincronización {record.type === 'manual' ? 'Manual' : 'Programada'}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                      {record.status === 'success' ? 'Exitosa' : record.status === 'error' ? 'Error' : 'Parcial'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDuration(record.duration)}</span>
                    </div>
                    <div>{formatTimestamp(record.timestamp)}</div>
                  </div>
                </div>
                
                <p className="text-sm text-gray-700 mb-3">{record.summary}</p>
                
                {/* Records Updated */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div className="text-center p-2 bg-blue-50 rounded">
                    <div className="text-sm font-bold text-blue-600">{record.recordsUpdated.inventory}</div>
                    <div className="text-xs text-blue-700">Inventario</div>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded">
                    <div className="text-sm font-bold text-green-600">{record.recordsUpdated.sales}</div>
                    <div className="text-xs text-green-700">Ventas</div>
                  </div>
                  <div className="text-center p-2 bg-purple-50 rounded">
                    <div className="text-sm font-bold text-purple-600">{record.recordsUpdated.suppliers}</div>
                    <div className="text-xs text-purple-700">Proveedores</div>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded">
                    <div className="text-sm font-bold text-amber-600">{record.recordsUpdated.clients}</div>
                    <div className="text-xs text-amber-700">Clientes</div>
                  </div>
                </div>
                
                {/* Errors and Warnings */}
                {record.errors && record.errors.length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <h4 className="text-sm font-medium text-red-800 mb-1">Errores:</h4>
                    <ul className="space-y-1">
                      {record.errors.map((error, index) => (
                        <li key={index} className="text-xs text-red-700">• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {record.warnings && record.warnings.length > 0 && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <h4 className="text-sm font-medium text-amber-800 mb-1">Advertencias:</h4>
                    <ul className="space-y-1">
                      {record.warnings.map((warning, index) => (
                        <li key={index} className="text-xs text-amber-700">• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Triggered By */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    <User className="w-3 h-3" />
                    <span>Iniciado por: {record.triggeredBy === 'system' ? 'Sistema' : record.triggeredBy}</span>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <span>ID: {record.id}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {filteredHistory.length === 0 && (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron registros</h3>
            <p className="text-sm text-gray-500">
              No hay sincronizaciones que coincidan con los filtros seleccionados.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncHistory;