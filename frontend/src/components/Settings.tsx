import React, { useState } from 'react';
import { Database, Truck, Clock, Shield, Save } from 'lucide-react';
import SupplierConfiguration from './SupplierConfiguration';
import DataSynchronization from './DataSynchronization';
import SyncHistory from './SyncHistory';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'sync' | 'history' | 'general'>('suppliers');

  const tabs = [
    {
      id: 'suppliers' as const,
      name: 'Proveedores',
      icon: Truck,
      description: 'Gestionar proveedores, lead times y productos'
    },
    {
      id: 'sync' as const,
      name: 'Sincronización',
      icon: Database,
      description: 'Configurar frecuencia y fuentes de datos'
    },
    {
      id: 'history' as const,
      name: 'Historial',
      icon: Clock,
      description: 'Ver histórico de sincronizaciones'
    },
    {
      id: 'general' as const,
      name: 'General',
      icon: Shield,
      description: 'Configuración general del sistema'
    }
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'suppliers':
        return <SupplierConfiguration />;
      case 'sync':
        return <DataSynchronization />;
      case 'history':
        return <SyncHistory />;
      case 'general':
        return <GeneralSettings />;
      default:
        return <SupplierConfiguration />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-gray-600">Gestiona proveedores, sincronización y preferencias del sistema</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-navy-600 text-white rounded-md hover:bg-navy-700 transition-colors">
            <Save className="w-4 h-4" />
            <span>Guardar Cambios</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-navy-500 text-navy-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <IconComponent className={`mr-2 h-5 w-5 ${
                  activeTab === tab.id ? 'text-navy-500' : 'text-gray-400 group-hover:text-gray-500'
                }`} />
                <div className="text-left">
                  <div>{tab.name}</div>
                  <div className="text-xs font-normal text-gray-500">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="py-6">
        {renderActiveTab()}
      </div>
    </div>
  );
};

// General Settings Component
const GeneralSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración General</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Empresa</label>
            <input
              type="text"
              defaultValue="Distribuidora Freddy Da Silva"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
              readOnly
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Región</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500">
                <option value="venezuela">Venezuela</option>
                <option value="colombia">Colombia</option>
                <option value="latam">América Latina</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Moneda Base</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500">
                <option value="USD">USD - Dólar Americano</option>
                <option value="VES">VES - Bolívar Venezolano</option>
                <option value="COP">COP - Peso Colombiano</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Buffer de Lead Time (días adicionales)</label>
            <input
              type="number"
              defaultValue="2"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
            <p className="text-sm text-gray-500 mt-1">Días adicionales a agregar a los lead times de proveedores para seguridad</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Umbral Stock Bajo (%)</label>
              <input
                type="number"
                defaultValue="20"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Umbral Stock Crítico (%)</label>
              <input
                type="number"
                defaultValue="10"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Horario Comercial</h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hora Inicio</label>
            <input
              type="time"
              defaultValue="08:00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hora Fin</label>
            <input
              type="time"
              defaultValue="18:00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Zona Horaria</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-500">
              <option value="America/Caracas">América/Caracas (VET)</option>
              <option value="America/Bogota">América/Bogotá (COT)</option>
              <option value="America/New_York">América/Nueva_York (EST)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;