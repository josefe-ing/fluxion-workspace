import React, { useState } from 'react';
import { 
  Bot, AlertTriangle, Lightbulb, BarChart3, Clock, ChevronDown, ChevronUp, 
  CheckCircle, RefreshCw, Wifi, WifiOff, Database, Sparkles, Target
} from 'lucide-react';
import { useAIEngine } from '../hooks/useAIEngine';
import type { 
  AIEngineInsight, 
  AIEngineRecommendation 
} from '../types';

interface EnhancedAIAgentPanelProps {
  newAlertsCount: number;
  onClearNewAlerts: () => void;
}

const EnhancedAIAgentPanel: React.FC<EnhancedAIAgentPanelProps> = ({ 
  newAlertsCount: _newAlertsCount, 
  onClearNewAlerts: _onClearNewAlerts 
}) => {
  // AI Engine hook
  const {
    isLoadingAny,
    isConnected,
    hasAllData,
    hasAnyError,
    getAllInsights,
    getAllRecommendations,
    refreshAll,
    getLastUpdatedTime,
    topProducts,
    timePatterns,
    revenueTrends,
    error
  } = useAIEngine({
    periodDays: 30,
    autoRefresh: true,
    refreshInterval: 300000 // 5 minutes
  });

  // Component state
  const [activeTab, setActiveTab] = useState<'insights' | 'recommendations' | 'status'>('insights');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [processedActions, setProcessedActions] = useState<Set<string>>(new Set());
  
  // Convert AI Engine insights to alert format
  const convertInsightsToAlerts = (): AIEngineInsight[] => {
    return getAllInsights().map((insight, index) => ({
      id: `ai-${insight.source}-${index}`,
      type: insight.type as 'critical' | 'opportunity' | 'insight',
      title: insight.title,
      message: insight.description,
      timestamp: 'Hace ' + Math.floor(Math.random() * 30) + ' min',
      priority: insight.confidence > 0.8 ? 'high' as const : insight.confidence > 0.6 ? 'medium' as const : 'low' as const,
      actions: ['Ver Detalles', 'Aplicar Recomendación', 'Dismiss'],
      isNew: false,
      decisionType: insight.source === 'revenue-trends' ? 'strategic' as const : 'tactical' as const,
      timeframe: insight.source === 'top-products' ? 'Inmediato' : insight.source === 'time-patterns' ? '1-7 días' : '1-3 meses',
      impact: insight.source === 'top-products' ? 'immediate' as const : 'short-term' as const,
      source: insight.source,
      confidence: insight.confidence,
      businessImpact: insight.businessImpact,
      recommendation: insight.recommendation
    }));
  };

  // Get AI recommendations
  const getAIRecommendations = (): AIEngineRecommendation[] => {
    return getAllRecommendations().map((rec, index) => ({
      id: `rec-${rec.source}-${index}`,
      ...rec
    }));
  };

  const aiInsights = convertInsightsToAlerts();
  const aiRecommendations = getAIRecommendations();

  // Handle action execution
  const handleAction = (alertId: string, actionLabel: string) => {
    console.log(`Executing action: ${actionLabel} for alert: ${alertId}`);
    setProcessedActions(prev => new Set([...prev, `${alertId}-${actionLabel}`]));
    
    // Show feedback
    setTimeout(() => {
      setProcessedActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(`${alertId}-${actionLabel}`);
        return newSet;
      });
    }, 2000);
  };

  // Connection status component
  const ConnectionStatus = () => (
    <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs ${
      isConnected 
        ? 'bg-green-50 text-green-800 border border-green-200' 
        : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      <span>{isConnected ? 'Conectado al AI Engine' : 'Desconectado'}</span>
      {isConnected && (
        <span className="text-gray-500">• {getLastUpdatedTime()}</span>
      )}
    </div>
  );

  // Data statistics component
  const DataStats = () => {
    if (!hasAllData) return null;

    return (
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-blue-50 p-2 rounded text-center">
          <div className="text-sm font-medium text-blue-900">
            {topProducts?.topProducts.length || 0}
          </div>
          <div className="text-xs text-blue-600">Productos</div>
        </div>
        <div className="bg-green-50 p-2 rounded text-center">
          <div className="text-sm font-medium text-green-900">
            {timePatterns?.insights.length || 0}
          </div>
          <div className="text-xs text-green-600">Patrones</div>
        </div>
        <div className="bg-purple-50 p-2 rounded text-center">
          <div className="text-sm font-medium text-purple-900">
            {revenueTrends?.summary.trendDirection === 'growing' ? '↗️' : revenueTrends?.summary.trendDirection === 'declining' ? '↘️' : '→'}
          </div>
          <div className="text-xs text-purple-600">Tendencia</div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Fluxion AI Engine</h3>
            <p className="text-sm text-gray-500">Análisis en tiempo real</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isLoadingAny && (
            <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
          )}
          <button
            onClick={refreshAll}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoadingAny}
            title="Actualizar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className="p-4 pb-2">
        <ConnectionStatus />
      </div>

      {/* Data Stats */}
      <div className="px-4">
        <DataStats />
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 px-4">
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'insights'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Insights</span>
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
            {aiInsights.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('recommendations')}
          className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'recommendations'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Acciones</span>
          <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
            {aiRecommendations.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'status'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Estado</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {/* Loading State */}
        {isLoadingAny && !hasAllData && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-3 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Cargando análisis AI...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {hasAnyError && !hasAllData && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <h4 className="font-medium text-red-900 mb-1">Error de Conexión</h4>
            <p className="text-sm text-red-600 mb-3">
              {error || 'No se pudo conectar con el AI Engine'}
            </p>
            <button
              onClick={refreshAll}
              className="inline-flex items-center space-x-2 px-3 py-1.5 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reintentar</span>
            </button>
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && hasAllData && (
          <div className="space-y-3">
            {aiInsights.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>No hay nuevos insights disponibles</p>
              </div>
            ) : (
              aiInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={`border rounded-lg p-3 transition-all duration-200 ${
                    insight.type === 'critical' 
                      ? 'border-red-200 bg-red-50' 
                      : insight.type === 'opportunity'
                      ? 'border-green-200 bg-green-50'
                      : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {insight.type === 'critical' ? (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        ) : insight.type === 'opportunity' ? (
                          <Lightbulb className="w-4 h-4 text-green-600" />
                        ) : (
                          <BarChart3 className="w-4 h-4 text-blue-600" />
                        )}
                        <span className="font-medium text-gray-900 text-sm">
                          {insight.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          insight.confidence > 0.8 ? 'bg-green-100 text-green-800' :
                          insight.confidence > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {Math.round(insight.confidence * 100)}% confianza
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-700 mb-2">
                        {insight.message}
                      </p>
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{insight.timestamp}</span>
                        </span>
                        <span className="capitalize">
                          Fuente: {insight.source.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setExpandedItem(
                        expandedItem === insight.id ? null : insight.id
                      )}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {expandedItem === insight.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {expandedItem === insight.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Impacto de Negocio:</span>
                          <p className="text-gray-600 mt-1">{insight.businessImpact}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Recomendación:</span>
                          <p className="text-gray-600 mt-1">{insight.recommendation}</p>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 mt-3">
                        {insight.actions.map((action) => (
                          <button
                            key={action}
                            onClick={() => handleAction(insight.id, action)}
                            disabled={processedActions.has(`${insight.id}-${action}`)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              processedActions.has(`${insight.id}-${action}`)
                                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {processedActions.has(`${insight.id}-${action}`) ? (
                              <span className="flex items-center space-x-1">
                                <CheckCircle className="w-3 h-3" />
                                <span>Procesado</span>
                              </span>
                            ) : (
                              action
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommendations' && hasAllData && (
          <div className="space-y-3">
            {aiRecommendations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Target className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>No hay recomendaciones disponibles</p>
              </div>
            ) : (
              aiRecommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`border rounded-lg p-3 transition-all duration-200 ${
                    rec.priority === 'high' 
                      ? 'border-red-200 bg-red-50' 
                      : rec.priority === 'medium'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                        rec.priority === 'high' ? 'bg-red-100 text-red-800' :
                        rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {rec.priority}
                      </span>
                      <span className="text-xs text-gray-500 capitalize">
                        {rec.category}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 capitalize">
                      {rec.source.replace('-', ' ')}
                    </span>
                  </div>
                  
                  <h4 className="font-medium text-gray-900 text-sm mb-1">
                    {rec.title}
                  </h4>
                  
                  <p className="text-sm text-gray-700 mb-2">
                    {rec.description}
                  </p>
                  
                  <div className="bg-white rounded border p-2 mb-2">
                    <p className="text-sm font-medium text-gray-700 mb-1">Acción:</p>
                    <p className="text-sm text-gray-600">{rec.action}</p>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Impacto: {rec.expectedImpact}</span>
                    <span>Plazo: {rec.timeframe}</span>
                  </div>
                  
                  <button
                    onClick={() => handleAction(rec.id, 'implement')}
                    disabled={processedActions.has(`${rec.id}-implement`)}
                    className={`w-full mt-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      processedActions.has(`${rec.id}-implement`)
                        ? 'bg-green-100 text-green-800 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {processedActions.has(`${rec.id}-implement`) ? (
                      <span className="flex items-center justify-center space-x-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>Implementado</span>
                      </span>
                    ) : (
                      'Implementar Recomendación'
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Status Tab */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {/* Connection Status */}
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium text-gray-900 text-sm mb-2">Estado de Conexión</h4>
                <div className="flex items-center space-x-2">
                  {isConnected ? (
                    <>
                      <Wifi className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-700">Conectado al AI Engine</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-700">Desconectado</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Última actualización: {getLastUpdatedTime()}
                </p>
              </div>

              {/* Data Status */}
              {hasAllData && (
                <>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <h4 className="font-medium text-blue-900 text-sm mb-2">Top Products</h4>
                    <div className="text-sm text-blue-700">
                      {topProducts?.topProducts.length} productos analizados
                    </div>
                    <div className="text-xs text-blue-600">
                      Ingresos totales: ${topProducts?.metadata.totalRevenue.toFixed(2)}
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-3">
                    <h4 className="font-medium text-green-900 text-sm mb-2">Patrones Temporales</h4>
                    <div className="text-sm text-green-700">
                      {timePatterns?.metadata.totalTransactions} transacciones analizadas
                    </div>
                    <div className="text-xs text-green-600">
                      Período: {timePatterns?.metadata.periodDays} días
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-3">
                    <h4 className="font-medium text-purple-900 text-sm mb-2">Tendencias de Ingresos</h4>
                    <div className="text-sm text-purple-700">
                      Tendencia: {revenueTrends?.summary.trendDirection}
                    </div>
                    <div className="text-xs text-purple-600">
                      Cambio: {revenueTrends?.summary.changePercentage.toFixed(1)}%
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedAIAgentPanel;