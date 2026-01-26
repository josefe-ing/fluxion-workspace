import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Store,
  Package,
  DollarSign,
  Map,
  BarChart3,
  ArrowLeftRight,
  LayoutDashboard,
} from 'lucide-react';
import ProductAnalysis from './ProductAnalysis';
import Profitability from './Profitability';
import CoverageDistribution from './CoverageDistribution';
import { StoresDashboard, StoreDetailView, CompareStoresView, StoresRankingView } from './stores';
import ABCAnalysisView from './products/ABCAnalysisView';

type TabId = 'network' | 'store-detail' | 'stores' | 'products' | 'abc' | 'profitability' | 'coverage' | 'compare';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
}

const tabs: Tab[] = [
  {
    id: 'network',
    label: 'Dashboard de Red',
    icon: LayoutDashboard,
    description: 'KPIs consolidados de todas las tiendas',
  },
  {
    id: 'store-detail',
    label: 'Detalle de Tienda',
    icon: Store,
    description: 'Análisis profundo por tienda individual',
  },
  {
    id: 'compare',
    label: 'Comparar Tiendas',
    icon: ArrowLeftRight,
    description: 'Compara productos entre tiendas',
  },
  {
    id: 'stores',
    label: 'Ranking Tiendas',
    icon: BarChart3,
    description: 'Análisis comparativo de tiendas',
  },
  {
    id: 'products',
    label: 'Por Producto',
    icon: Package,
    description: 'Matriz GMROI/Rotación',
  },
  {
    id: 'abc',
    label: 'Análisis ABC',
    icon: BarChart3,
    description: 'Clasificación ABC consolidada',
  },
  {
    id: 'profitability',
    label: 'Rentabilidad',
    icon: DollarSign,
    description: 'Margen y GMROI por categoría',
  },
  {
    id: 'coverage',
    label: 'Cobertura',
    icon: Map,
    description: 'Distribución de productos',
  },
];

export default function BusinessIntelligence() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabId) || 'network';

  const handleTabChange = (tabId: TabId) => {
    setSearchParams({ tab: tabId });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'network':
        return <StoresDashboard />;
      case 'store-detail':
        return <StoreDetailView />;
      case 'compare':
        return <CompareStoresView />;
      case 'stores':
        return <StoresRankingView />;
      case 'products':
        return <ProductAnalysis />;
      case 'abc':
        return <ABCAnalysisView />;
      case 'profitability':
        return <Profitability />;
      case 'coverage':
        return <CoverageDistribution />;
      default:
        return <StoresDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Business Intelligence
              </h1>
              <p className="text-sm text-gray-500">
                Análisis de rentabilidad, cobertura y ROI del sistema
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-2" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-200 whitespace-nowrap
                    ${
                      isActive
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderTabContent()}
      </div>
    </div>
  );
}
