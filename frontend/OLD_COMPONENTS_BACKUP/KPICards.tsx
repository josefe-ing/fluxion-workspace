import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { kpiData } from '../data/mockData';
import type { KPIData } from '../types';

const KPICards: React.FC = () => {
  const getTrendIcon = (trend: KPIData['trend']) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-success-600" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-danger-600" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const getTrendColor = (trend: KPIData['trend']) => {
    switch (trend) {
      case 'up':
        return 'text-success-600';
      case 'down':
        return 'text-danger-600';
      case 'stable':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      {kpiData.map((kpi, index) => (
        <div
          key={index}
          className="card card-hover animate-fade-in py-8"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-2">{kpi.label}</p>
              <p className="text-4xl font-bold text-gray-900 mb-3">{kpi.value}</p>
              
              <div className="flex items-center space-x-2">
                {getTrendIcon(kpi.trend)}
                <span className={`text-sm font-medium ${getTrendColor(kpi.trend)}`}>
                  {kpi.change}
                </span>
              </div>
              
              {kpi.subtitle && (
                <p className="text-xs text-gray-500 mt-1">{kpi.subtitle}</p>
              )}
              
              {kpi.target && (
                <p className="text-xs text-gray-500 mt-1">{kpi.target}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default KPICards;