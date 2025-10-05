import React, { useState } from 'react';
import { Download, TrendingUp, Target, Award } from 'lucide-react';
import { PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

interface OptimizationReport {
  id: string;
  weekOf: string;
  period: string;
  summary: {
    totalValueGenerated: number;
    decisionsRecommended: number;
    decisionsFollowed: number;
    effectivenessRate: number;
  };
  categories: {
    costSavings: number;
    revenueIncrease: number;
    efficiencyGains: number;
  };
  topWins: {
    title: string;
    value: number;
    description: string;
  }[];
  opportunitiesMissed: {
    title: string;
    potentialValue: number;
    reason: string;
  }[];
  nextWeekPotential: {
    predictedValue: number;
    topOpportunities: string[];
  };
}

const OptimizationReports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<string>('current');

  const currentWeekReport: OptimizationReport = {
    id: 'REP_2024_W33',
    weekOf: 'Semana del 12-18 Agosto 2024',
    period: 'Semana Actual',
    summary: {
      totalValueGenerated: 159600,
      decisionsRecommended: 23,
      decisionsFollowed: 19,
      effectivenessRate: 82.6
    },
    categories: {
      costSavings: 83600,
      revenueIncrease: 67500,
      efficiencyGains: 8500
    },
    topWins: [
      {
        title: 'Prevención Stockout Pringles',
        value: 67000,
        description: 'Alerta temprana evitó pérdida ventas por 15 días sin stock'
      },
      {
        title: 'Optimización Halloween Oreo',
        value: 23000,
        description: 'Ajuste de orden de 30K a 20K basado en predicción estacional'
      },
      {
        title: 'Proveedor Alternativo Red Bull',
        value: 15600,
        description: 'Identificó descuento 12% vs proveedor habitual'
      }
    ],
    opportunitiesMissed: [
      {
        title: 'Oportunidad Precio Snickers',
        potentialValue: 8500,
        reason: 'No se implementó aumento precio cuando competencia tuvo stockout'
      },
      {
        title: 'Cross-sell Coca-Cola + Snacks',
        potentialValue: 12000,
        reason: 'Vendedores no ofrecieron bundle recomendado a 3 clientes grandes'
      }
    ],
    nextWeekPotential: {
      predictedValue: 178000,
      topOpportunities: [
        'Halloween: Preparar stock chocolates (+$89K)',
        'Negociar términos anuales Colombia (+$45K)',
        'Optimizar mix productos de rotación lenta (+$23K)'
      ]
    }
  };

  const previousReports = [
    { id: 'REP_2024_W32', period: 'Sem. 5-11 Agosto', value: 142300 },
    { id: 'REP_2024_W31', period: 'Sem. 29 Jul-4 Ago', value: 98700 },
    { id: 'REP_2024_W30', period: 'Sem. 22-28 Julio', value: 134500 }
  ];

  const categoryData = [
    { name: 'Ahorros Costos', value: currentWeekReport.categories.costSavings, color: '#10b981' },
    { name: 'Aumento Ingresos', value: currentWeekReport.categories.revenueIncrease, color: '#3b82f6' },
    { name: 'Ganancia Eficiencia', value: currentWeekReport.categories.efficiencyGains, color: '#8b5cf6' }
  ];

  const weeklyTrend = [
    { week: 'W30', value: 134500 },
    { week: 'W31', value: 98700 },
    { week: 'W32', value: 142300 },
    { week: 'W33', value: 159600 },
    { week: 'W34*', value: 178000 } // Predicted
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const generatePDFReport = () => {
    // Simulate PDF generation
    alert('Generando reporte PDF... (funcionalidad demo)');
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reportes de Optimización</h2>
          <p className="text-gray-600">Impacto semanal de Fluxion AI en tu operación</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedReport}
            onChange={(e) => setSelectedReport(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="current">Semana Actual</option>
            {previousReports.map(report => (
              <option key={report.id} value={report.id}>{report.period}</option>
            ))}
          </select>
          <button
            onClick={generatePDFReport}
            className="flex items-center space-x-2 px-4 py-2 bg-navy-600 text-white rounded-md hover:bg-navy-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold">{currentWeekReport.period}</h3>
            <p className="text-sm opacity-90">{currentWeekReport.weekOf}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{formatCurrency(currentWeekReport.summary.totalValueGenerated)}</div>
            <div className="text-sm opacity-90">Valor Total Generado</div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-2xl font-bold">{currentWeekReport.summary.decisionsFollowed}/{currentWeekReport.summary.decisionsRecommended}</div>
            <div className="text-sm opacity-90">Decisiones Implementadas</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-2xl font-bold">{currentWeekReport.summary.effectivenessRate}%</div>
            <div className="text-sm opacity-90">Tasa de Efectividad</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-2xl font-bold">+12%</div>
            <div className="text-sm opacity-90">vs Semana Anterior</div>
          </div>
        </div>
      </div>

      {/* Value Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución de Valor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trend Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencia Semanal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            * W34 = Predicción basada en oportunidades identificadas
          </div>
        </div>
      </div>

      {/* Top Wins */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Award className="w-5 h-5 text-yellow-500" />
          <span>Principales Logros</span>
        </h3>
        <div className="space-y-3">
          {currentWeekReport.topWins.map((win, index) => (
            <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-green-900">{win.title}</h4>
                <span className="text-xl font-bold text-green-600">{formatCurrency(win.value)}</span>
              </div>
              <p className="text-sm text-green-700">{win.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Opportunities Missed */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Target className="w-5 h-5 text-amber-500" />
          <span>Oportunidades No Capturadas</span>
        </h3>
        <div className="space-y-3">
          {currentWeekReport.opportunitiesMissed.map((missed, index) => (
            <div key={index} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-amber-900">{missed.title}</h4>
                <span className="text-lg font-bold text-amber-600">-{formatCurrency(missed.potentialValue)}</span>
              </div>
              <p className="text-sm text-amber-700">{missed.reason}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <strong>Valor no capturado:</strong> {formatCurrency(currentWeekReport.opportunitiesMissed.reduce((sum, m) => sum + m.potentialValue, 0))}
          </div>
        </div>
      </div>

      {/* Next Week Potential */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
        <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
          <TrendingUp className="w-5 h-5" />
          <span>Potencial Próxima Semana</span>
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-3xl font-bold mb-2">
              {formatCurrency(currentWeekReport.nextWeekPotential.predictedValue)}
            </div>
            <div className="text-sm opacity-90">Valor Potencial Predicho</div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-2">Top Oportunidades:</h4>
            <ul className="space-y-1 text-sm">
              {currentWeekReport.nextWeekPotential.topOpportunities.map((opportunity, index) => (
                <li key={index} className="opacity-90">• {opportunity}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Action Items */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Plan de Acción Próxima Semana</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="font-medium">Mejorar tasa de implementación de recomendaciones (meta: 90%)</span>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-amber-50 rounded-lg">
            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
            <span className="font-medium">Capacitar equipo ventas en ofertas cross-sell automatizadas</span>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium">Implementar alertas automáticas para oportunidades tiempo-sensitivas</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptimizationReports;