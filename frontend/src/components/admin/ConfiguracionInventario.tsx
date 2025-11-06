import { useState } from 'react';
import ConfiguracionGlobal from './ConfiguracionGlobal';
import ConfiguracionTienda from './ConfiguracionTienda';
import ConfiguracionProductos from './ConfiguracionProductos';

type Tab = 'global' | 'tienda' | 'productos';

export default function ConfiguracionInventario() {
  const [activeTab, setActiveTab] = useState<Tab>('global');

  const tabs = [
    { id: 'global' as Tab, label: 'Configuración Global', icon: '🌍' },
    { id: 'tienda' as Tab, label: 'Por Tienda', icon: '🏪' },
    { id: 'productos' as Tab, label: 'Productos Frío/Verde', icon: '❄️🥬' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración de Inventario</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gestiona parámetros de stock, clasificación ABC y configuración por tienda
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'global' && <ConfiguracionGlobal />}
        {activeTab === 'tienda' && <ConfiguracionTienda />}
        {activeTab === 'productos' && <ConfiguracionProductos />}
      </div>
    </div>
  );
}
