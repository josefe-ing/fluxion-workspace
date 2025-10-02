import React, { useState } from 'react';
import { Database, RefreshCw, Clock, CheckCircle, AlertCircle, Play, Pause, Settings as SettingsIcon } from 'lucide-react';
import { SyncConfiguration } from '../types';

const DataSynchronization: React.FC = () => {
  const [syncConfig, setSyncConfig] = useState<SyncConfiguration>({
    frequency: 'daily',
    autoSync: true,
    syncTime: '06:00',
    dataSources: {
      inventory: true,
      sales: true,
      suppliers: true,
      clients: true
    },
    lastSyncTimestamp: '2024-08-14T06:00:00Z'
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'success' | 'error' | 'partial'>('success');
  const [syncProgress, setSyncProgress] = useState(0);

  // Simulate manual sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0);
    
    // Simulate sync progress
    const interval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsSyncing(false);
          setLastSyncStatus('success');
          setSyncConfig(prev => ({
            ...prev,
            lastSyncTimestamp: new Date().toISOString()
          }));
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const formatLastSync = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) {
      return `Hace ${diffInMinutes} minutos`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `Hace ${diffInHours} horas`;
    }
    
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50';
      case 'error': return 'text-red-600 bg-red-50';
      case 'partial': return 'text-amber-600 bg-amber-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      case 'partial': return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Sync Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Estado de Sincronización</h3>
            <p className="text-sm text-gray-600">Última sincronización y controles manuales</p>
          </div>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center space-x-2 px-4 py-2 bg-navy-600 text-white rounded-md hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Last Sync Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Última Sincronización</p>
                <p className="text-xs text-gray-500">
                  {syncConfig.lastSyncTimestamp ? formatLastSync(syncConfig.lastSyncTimestamp) : 'Nunca'}
                </p>
              </div>
            </div>
            
            <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(lastSyncStatus)}`}>
              {getStatusIcon(lastSyncStatus)}
              <span className="capitalize">{lastSyncStatus === 'success' ? 'Exitosa' : lastSyncStatus}</span>
            </div>
          </div>

          {/* Auto Sync Status */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                {syncConfig.autoSync ? 
                  <Play className="w-5 h-5 text-green-600" /> : 
                  <Pause className="w-5 h-5 text-gray-600" />
                }
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Sincronización Automática</p>
                <p className="text-xs text-gray-500">
                  {syncConfig.autoSync ? `Activa (${syncConfig.frequency})` : 'Inactiva'}
                </p>
              </div>
            </div>
            
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              syncConfig.autoSync ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100'
            }`}>
              {syncConfig.autoSync ? 'Habilitada' : 'Deshabilitada'}
            </div>
          </div>

          {/* Next Sync */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Próxima Sincronización</p>
                <p className="text-xs text-gray-500">
                  {syncConfig.autoSync ? `Mañana a las ${syncConfig.syncTime}` : 'Manual únicamente'}
                </p>
              </div>
            </div>
            
            <div className="text-xs text-purple-600 font-medium">
              {syncConfig.frequency === 'hourly' ? 'Cada hora' : 
               syncConfig.frequency === 'daily' ? 'Diaria' : 
               syncConfig.frequency === 'weekly' ? 'Semanal' : 'Manual'}
            </div>
          </div>
        </div>

        {/* Sync Progress */}
        {isSyncing && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">Sincronizando datos...</span>
              <span className="text-sm text-blue-700">{syncProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${syncProgress}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Sync Configuration */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración de Sincronización</h3>
        
        <div className="space-y-6">
          {/* Auto Sync Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Sincronización Automática</h4>
              <p className="text-sm text-gray-500">Habilitar sincronización programada automática</p>
            </div>
            <button
              onClick={() => setSyncConfig(prev => ({ ...prev, autoSync: !prev.autoSync }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                syncConfig.autoSync ? 'bg-navy-600' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                syncConfig.autoSync ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Frequency Settings */}
          {syncConfig.autoSync && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frecuencia de Sincronización
                </label>
                <select
                  value={syncConfig.frequency}
                  onChange={(e) => setSyncConfig(prev => ({ 
                    ...prev, 
                    frequency: e.target.value as SyncConfiguration['frequency']
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
                >
                  <option value="hourly">Cada hora</option>
                  <option value="daily">Diaria</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de Sincronización
                </label>
                <input
                  type="time"
                  value={syncConfig.syncTime}
                  onChange={(e) => setSyncConfig(prev => ({ ...prev, syncTime: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Sources Configuration */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Fuentes de Datos</h3>
        <p className="text-sm text-gray-600 mb-4">Selecciona qué datos sincronizar automáticamente</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(syncConfig.dataSources).map(([source, enabled]) => {
            const sourceLabels: Record<string, { label: string; description: string; icon: any }> = {
              inventory: { 
                label: 'Inventario', 
                description: 'Stock, movimientos, valorización',
                icon: Database
              },
              sales: { 
                label: 'Ventas', 
                description: 'Órdenes, facturación, clientes',
                icon: RefreshCw
              },
              suppliers: { 
                label: 'Proveedores', 
                description: 'Contactos, precios, términos',
                icon: SettingsIcon
              },
              clients: { 
                label: 'Clientes', 
                description: 'Perfiles, historial, preferencias',
                icon: CheckCircle
              }
            };

            const sourceInfo = sourceLabels[source];
            const IconComponent = sourceInfo.icon;

            return (
              <div key={source} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    enabled ? 'bg-navy-100' : 'bg-gray-100'
                  }`}>
                    <IconComponent className={`w-5 h-5 ${
                      enabled ? 'text-navy-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{sourceInfo.label}</h4>
                    <p className="text-xs text-gray-500">{sourceInfo.description}</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setSyncConfig(prev => ({
                    ...prev,
                    dataSources: {
                      ...prev.dataSources,
                      [source]: !enabled
                    }
                  }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    enabled ? 'bg-navy-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sync Performance Metrics */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Métricas de Sincronización</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">98.5%</div>
            <div className="text-sm text-green-700">Tasa de Éxito</div>
            <div className="text-xs text-green-600 mt-1">Últimos 30 días</div>
          </div>
          
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">2.3s</div>
            <div className="text-sm text-blue-700">Tiempo Promedio</div>
            <div className="text-xs text-blue-600 mt-1">Por sincronización</div>
          </div>
          
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">12,450</div>
            <div className="text-sm text-purple-700">Registros Hoy</div>
            <div className="text-xs text-purple-600 mt-1">Total sincronizados</div>
          </div>
          
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <div className="text-2xl font-bold text-amber-600">99.2%</div>
            <div className="text-sm text-amber-700">Disponibilidad</div>
            <div className="text-xs text-amber-600 mt-1">Sistema fuente</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataSynchronization;