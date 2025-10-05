import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Package, MapPin, TrendingUp } from 'lucide-react';
import { warehouseData } from '../data/mockData';
import InventoryStatusBreakdown from './InventoryStatusBreakdown';

const MainDashboard: React.FC = () => {
  const COLORS = warehouseData.topCategories.map(cat => cat.color);

  const monthlyTrends = [
    { month: 'Jun', inventario: 11200000, ventas: 8500000 },
    { month: 'Jul', inventario: 11800000, ventas: 9200000 },
    { month: 'Ago', inventario: 12300000, ventas: 8800000 },
    { month: 'Sep', inventario: 12100000, ventas: 9500000 },
    { month: 'Oct', inventario: 11900000, ventas: 10200000 },
    { month: 'Nov', inventario: 12300000, ventas: 9800000 }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatCompactCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return formatCurrency(value);
  };

  return (
    <div className="space-y-6">
      {/* Inventory Status Breakdown */}
      <div className="card">
        <InventoryStatusBreakdown />
      </div>
      {/* Warehouse Overview */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-navy-900" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Almacén Principal</h2>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <MapPin className="w-4 h-4" />
                <span>{warehouseData.location}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {warehouseData.occupancyPercent}%
            </div>
            <div className="text-sm text-gray-500">Ocupación</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inventory by Category - Pie Chart */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Inventario por Categoría
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={warehouseData.topCategories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name} ${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {warehouseData.topCategories.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCompactCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Detalle por Categoría
            </h3>
            <div className="space-y-3">
              {warehouseData.topCategories.map((category, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: category.color }}
                    ></div>
                    <span className="font-medium text-gray-900">{category.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      {formatCompactCurrency(category.value)}
                    </div>
                    <div className="text-sm text-gray-500">{category.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Trends */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-success-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Tendencias Mensuales</h2>
            <p className="text-sm text-gray-500">Inventario vs Ventas (últimos 6 meses)</p>
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={formatCompactCurrency} />
              <Tooltip formatter={(value: number) => formatCompactCurrency(value)} />
              <Legend />
              <Bar dataKey="inventario" fill="#1e3a8a" name="Inventario" />
              <Bar dataKey="ventas" fill="#059669" name="Ventas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;