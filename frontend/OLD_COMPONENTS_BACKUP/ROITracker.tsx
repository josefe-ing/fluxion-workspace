import React, { useState } from 'react';
import { TrendingUp, DollarSign, Target, Award, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ROIMetric {
  id: string;
  category: 'cost_savings' | 'revenue_increase' | 'efficiency_gain';
  title: string;
  description: string;
  value: number;
  date: string;
  source: string; // What Fluxion recommendation generated this
}

interface WeeklyROI {
  week: string;
  costSavings: number;
  revenueIncrease: number;
  totalValue: number;
}

const ROITracker: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter'>('week');

  const roiMetrics: ROIMetric[] = [
    {
      id: 'ROI001',
      category: 'cost_savings',
      title: 'Evitó Sobreinventario Oreo',
      description: 'Recomendación ajustar orden de 30K a 20K para Halloween',
      value: 23000,
      date: '2024-08-12',
      source: 'Predicción estacional + análisis stock'
    },
    {
      id: 'ROI002',
      category: 'revenue_increase',
      title: 'Stockout Prevention Pringles',
      description: 'Alerta temprana evitó pérdida ventas por 15 días',
      value: 67000,
      date: '2024-08-11',
      source: 'Algoritmo predictivo stockout'
    },
    {
      id: 'ROI003',
      category: 'cost_savings',
      title: 'Proveedor Alternativo Red Bull',
      description: 'Identificó 12% descuento vs proveedor habitual',
      value: 15600,
      date: '2024-08-10',
      source: 'Análisis comparativo proveedores'
    },
    {
      id: 'ROI004',
      category: 'efficiency_gain',
      title: 'Optimización Mínimos',
      description: 'Redujo capital inmovilizado ajustando órdenes',
      value: 45000,
      date: '2024-08-09',
      source: 'Validación mínimos vs recomendaciones'
    },
    {
      id: 'ROI005',
      category: 'revenue_increase',
      title: 'Oportunidad Snickers',
      description: 'Detectó competencia sin stock, aumentó precio 3%',
      value: 8500,
      date: '2024-08-08',
      source: 'Monitoreo mercado + análisis precios'
    }
  ];

  const weeklyData: WeeklyROI[] = [
    { week: 'Sem 1', costSavings: 45000, revenueIncrease: 32000, totalValue: 77000 },
    { week: 'Sem 2', costSavings: 38000, revenueIncrease: 45000, totalValue: 83000 },
    { week: 'Sem 3', costSavings: 52000, revenueIncrease: 67000, totalValue: 119000 },
    { week: 'Sem 4', costSavings: 39000, revenueIncrease: 75000, totalValue: 114000 },
    { week: 'Esta Sem', costSavings: 23000, revenueIncrease: 67500, totalValue: 90500 }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const totalROI = roiMetrics.reduce((sum, metric) => sum + metric.value, 0);
  const costSavings = roiMetrics.filter(m => m.category === 'cost_savings').reduce((sum, m) => sum + m.value, 0);
  const revenueIncrease = roiMetrics.filter(m => m.category === 'revenue_increase').reduce((sum, m) => sum + m.value, 0);
  const efficiencyGains = roiMetrics.filter(m => m.category === 'efficiency_gain').reduce((sum, m) => sum + m.value, 0);

  const getCategoryIcon = (category: ROIMetric['category']) => {
    switch (category) {
      case 'cost_savings': return <DollarSign className="w-4 h-4 text-green-600" />;
      case 'revenue_increase': return <TrendingUp className="w-4 h-4 text-blue-600" />;
      case 'efficiency_gain': return <Target className="w-4 h-4 text-purple-600" />;
    }
  };

  const getCategoryColor = (category: ROIMetric['category']) => {
    switch (category) {
      case 'cost_savings': return 'bg-green-50 border-green-200';
      case 'revenue_increase': return 'bg-blue-50 border-blue-200';
      case 'efficiency_gain': return 'bg-purple-50 border-purple-200';
    }
  };

  const getCategoryLabel = (category: ROIMetric['category']) => {
    switch (category) {
      case 'cost_savings': return 'Ahorro Costos';
      case 'revenue_increase': return 'Aumento Ingresos';
      case 'efficiency_gain': return 'Ganancia Eficiencia';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">ROI Tracker</h2>
          <p className="text-gray-600">Valor generado por Fluxion AI</p>
        </div>
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
          >
            <option value="week">Esta Semana</option>
            <option value="month">Este Mes</option>
            <option value="quarter">Este Trimestre</option>
          </select>
        </div>
      </div>

      {/* ROI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center space-x-2 mb-2">
            <Award className="w-6 h-6" />
            <span className="font-semibold">ROI Total</span>
          </div>
          <div className="text-3xl font-bold">{formatCurrency(totalROI)}</div>
          <div className="text-sm opacity-90">Esta semana</div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-green-900">Ahorros</span>
          </div>
          <div className="text-2xl font-bold text-green-900">{formatCurrency(costSavings)}</div>
          <div className="text-sm text-green-700">Costos evitados</div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-blue-900">Ingresos</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{formatCurrency(revenueIncrease)}</div>
          <div className="text-sm text-blue-700">Ventas adicionales</div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Target className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-purple-900">Eficiencia</span>
          </div>
          <div className="text-2xl font-bold text-purple-900">{formatCurrency(efficiencyGains)}</div>
          <div className="text-sm text-purple-700">Capital optimizado</div>
        </div>
      </div>

      {/* ROI Trend Chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencia de Valor Generado</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Bar dataKey="costSavings" stackId="a" fill="#10b981" name="Ahorros" />
              <Bar dataKey="revenueIncrease" stackId="a" fill="#3b82f6" name="Ingresos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed ROI Breakdown */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle de Valor Generado</h3>
        <div className="space-y-4">
          {roiMetrics.map((metric) => (
            <div
              key={metric.id}
              className={`p-4 rounded-lg border ${getCategoryColor(metric.category)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getCategoryIcon(metric.category)}
                    <span className="font-semibold text-gray-900">{metric.title}</span>
                    <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600">
                      {getCategoryLabel(metric.category)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2">{metric.description}</p>
                  
                  <div className="text-xs text-gray-500">
                    <span className="font-medium">Fuente:</span> {metric.source}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-xl font-bold text-green-600">
                    +{formatCurrency(metric.value)}
                  </div>
                  <div className="text-xs text-gray-500">{metric.date}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROI Score */}
      <div className="bg-gradient-to-r from-navy-500 to-navy-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2">Freddy's Optimization Score</h3>
            <p className="text-sm opacity-90">Basado en decisiones tomadas siguiendo recomendaciones Fluxion</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">87/100</div>
            <div className="text-sm opacity-90">Esta semana</div>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm opacity-90">Decisiones Seguidas</div>
            <div className="text-xl font-bold">19/23</div>
          </div>
          <div>
            <div className="text-sm opacity-90">Racha Actual</div>
            <div className="text-xl font-bold">12 días</div>
          </div>
          <div>
            <div className="text-sm opacity-90">ROI vs Objetivo</div>
            <div className="text-xl font-bold">145%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ROITracker;