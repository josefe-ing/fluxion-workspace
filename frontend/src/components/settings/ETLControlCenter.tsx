import { useState } from 'react';
import { Link } from 'react-router-dom';
import ConnectivityPanel from './ConnectivityPanel';
import InventarioETLPanel from './InventarioETLPanel';
import VentasETLPanel from './VentasETLPanel';

type TabType = 'inventario' | 'ventas';

export default function ETLControlCenter() {
  const [activeTab, setActiveTab] = useState<TabType>('ventas');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Panel de Administrador</h1>
          <p className="mt-2 text-sm text-gray-600">
            Centro de control, configuracion y monitoreo del sistema
          </p>
        </div>

        {/* Quick Access Links */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/administrador/generadores-trafico"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-yellow-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">💡</span>
              <div>
                <div className="font-medium text-gray-900 group-hover:text-yellow-600">Generadores de Trafico</div>
                <div className="text-xs text-gray-500">Productos criticos para clientes</div>
              </div>
            </div>
          </Link>
          <Link
            to="/administrador/config-inventario"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <div className="font-medium text-gray-900 group-hover:text-blue-600">Config Inventario</div>
                <div className="text-xs text-gray-500">Parametros y reglas</div>
              </div>
            </div>
          </Link>
          <Link
            to="/administrador/conjuntos"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-purple-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📦</span>
              <div>
                <div className="font-medium text-gray-900 group-hover:text-purple-600">Conjuntos</div>
                <div className="text-xs text-gray-500">Agrupaciones de productos</div>
              </div>
            </div>
          </Link>
          <Link
            to="/administrador/alertas"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-red-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center space-x-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-medium text-gray-900 group-hover:text-red-600">Alertas Reclasificacion</div>
                <div className="text-xs text-gray-500">Cambios ABC pendientes</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Panels Stack */}
        <div className="space-y-6">
          {/* 1. Connectivity Panel - Always visible at top */}
          <ConnectivityPanel />

          {/* 2. ETL Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('ventas')}
                  className={`flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'ventas'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span>ETL Ventas</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('inventario')}
                  className={`flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'inventario'
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>ETL Inventario</span>
                  </div>
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === 'ventas' && <VentasETLPanel />}
              {activeTab === 'inventario' && <InventarioETLPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
