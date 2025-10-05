import React from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAIEngine } from '../hooks/useAIEngine';
import type { EnhancedKPIData } from '../types';

const EnhancedKPICards: React.FC = () => {
  const {
    topProducts,
    timePatterns,
    revenueTrends,
    isLoadingAny,
    hasAllData,
    hasAnyError,
    error,
    refreshAll
  } = useAIEngine({
    periodDays: 30,
    autoRefresh: true
  });

  // Generate KPIs from AI Engine data
  const generateKPIData = (): EnhancedKPIData[] => {
    const kpis: EnhancedKPIData[] = [];

    if (topProducts) {
      // Total Revenue KPI
      kpis.push({
        label: 'Ingresos Totales',
        value: `$${topProducts.metadata.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        change: '+12.5%',
        trend: 'up' as const,
        target: '$2.0M',
        subtitle: `${topProducts.metadata.totalProducts} productos`,
        source: 'ai-engine',
        confidence: 0.95,
        lastUpdated: new Date().toLocaleTimeString('es-VE')
      });

      // Best Product KPI
      if (topProducts.topProducts.length > 0) {
        const bestProduct = topProducts.topProducts[0];
        kpis.push({
          label: 'Producto Líder',
          value: bestProduct.name.length > 20 ? bestProduct.name.substring(0, 20) + '...' : bestProduct.name,
          change: `${bestProduct.profitMargin.toFixed(1)}% margen`,
          trend: bestProduct.profitMargin > 25 ? 'up' as const : 'stable' as const,
          subtitle: `$${bestProduct.totalRevenue.toFixed(0)} ingresos`,
          source: 'ai-engine',
          confidence: 0.9,
          lastUpdated: new Date().toLocaleTimeString('es-VE')
        });
      }
    }

    if (timePatterns) {
      // Peak Hour KPI
      const peakHour = timePatterns.hourlyPatterns.reduce((max, current) => 
        current.revenue > max.revenue ? current : max
      );
      
      kpis.push({
        label: 'Hora Pico',
        value: peakHour.label,
        change: `${peakHour.transactions} transacciones`,
        trend: 'up' as const,
        subtitle: `$${peakHour.revenue.toFixed(0)} generados`,
        source: 'ai-engine',
        confidence: 0.85,
        lastUpdated: new Date().toLocaleTimeString('es-VE')
      });

      // Best Day KPI
      const bestDay = timePatterns.dailyPatterns.reduce((max, current) => 
        current.revenue > max.revenue ? current : max
      );
      
      kpis.push({
        label: 'Mejor Día',
        value: bestDay.dayName,
        change: `${bestDay.transactions} transacciones`,
        trend: 'up' as const,
        subtitle: `$${bestDay.revenue.toFixed(0)} generados`,
        source: 'ai-engine',
        confidence: 0.8,
        lastUpdated: new Date().toLocaleTimeString('es-VE')
      });
    }

    if (revenueTrends) {
      // Revenue Trend KPI
      const trendIcon = revenueTrends.summary.trendDirection === 'growing' ? '↗️' : 
                       revenueTrends.summary.trendDirection === 'declining' ? '↘️' : '➡️';
      
      kpis.push({
        label: 'Tendencia 30d',
        value: `${trendIcon} ${revenueTrends.summary.changePercentage.toFixed(1)}%`,
        change: revenueTrends.summary.trendDirection === 'growing' ? 'Crecimiento' : 
                revenueTrends.summary.trendDirection === 'declining' ? 'Declive' : 'Estable',
        trend: revenueTrends.summary.trendDirection === 'growing' ? 'up' as const : 
               revenueTrends.summary.trendDirection === 'declining' ? 'down' as const : 'stable' as const,
        subtitle: `$${revenueTrends.summary.currentPeriodRevenue.toFixed(0)} actual`,
        source: 'ai-engine',
        confidence: 0.9,
        lastUpdated: new Date().toLocaleTimeString('es-VE')
      });

      // Forecast KPI
      kpis.push({
        label: 'Predicción 30d',
        value: `$${revenueTrends.forecast.next30Days.predictedRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        change: `${(revenueTrends.forecast.next30Days.confidence * 100).toFixed(0)}% confianza`,
        trend: 'up' as const,
        subtitle: revenueTrends.forecast.next30Days.scenario,
        source: 'ai-engine',
        confidence: revenueTrends.forecast.next30Days.confidence,
        lastUpdated: new Date().toLocaleTimeString('es-VE')
      });
    }

    return kpis;
  };

  const kpiData = generateKPIData();

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      case 'stable':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  // Loading state
  if (isLoadingAny && !hasAllData) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
                <RefreshCw className="w-4 h-4 text-gray-300 animate-spin" />
              </div>
              <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (hasAnyError && !hasAllData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <h3 className="font-medium text-red-900 mb-1">Error al cargar KPIs</h3>
        <p className="text-sm text-red-600 mb-3">
          {error || 'No se pudo conectar con el AI Engine'}
        </p>
        <button
          onClick={refreshAll}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  // Main KPI display
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {kpiData.map((kpi, index) => (
        <div
          key={index}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">{kpi.label}</h3>
            <div className="flex items-center space-x-2">
              {getTrendIcon(kpi.trend)}
              {kpi.source === 'ai-engine' && (
                <div 
                  className="w-2 h-2 bg-blue-400 rounded-full" 
                  title="Datos del AI Engine"
                ></div>
              )}
            </div>
          </div>
          
          <div className="mb-2">
            <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
            {kpi.target && (
              <div className="text-xs text-gray-500">Meta: {kpi.target}</div>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-sm font-medium ${getTrendColor(kpi.trend)}`}>
                {kpi.change}
              </div>
              {kpi.subtitle && (
                <div className="text-xs text-gray-500 mt-1">{kpi.subtitle}</div>
              )}
            </div>
            
            {kpi.confidence && (
              <div className="text-xs text-gray-400">
                {Math.round(kpi.confidence * 100)}%
              </div>
            )}
          </div>
          
          {kpi.lastUpdated && (
            <div className="text-xs text-gray-400 mt-2 border-t pt-2">
              Act: {kpi.lastUpdated}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default EnhancedKPICards;