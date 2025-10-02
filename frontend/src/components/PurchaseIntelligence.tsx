import React, { useState } from 'react';
import { ShoppingCart, Package, TrendingUp, AlertCircle, DollarSign, Calendar } from 'lucide-react';
import { mockProducts } from '../data/mockData';
import type { ProductRecommendation } from '../types';

const PurchaseIntelligence: React.FC = () => {
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'priority' | 'cost' | 'stock'>('priority');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getPriorityColor = (priority: ProductRecommendation['priority']) => {
    switch (priority) {
      case 'critical':
        return 'bg-danger-100 text-danger-800 border-danger-200';
      case 'high':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'medium':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: ProductRecommendation['priority']) => {
    switch (priority) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-danger-600" />;
      case 'high':
        return <TrendingUp className="w-4 h-4 text-amber-600" />;
      case 'medium':
        return <Package className="w-4 h-4 text-blue-600" />;
      default:
        return <Package className="w-4 h-4 text-gray-600" />;
    }
  };

  const sortedProducts = [...mockProducts].sort((a, b) => {
    switch (sortBy) {
      case 'priority':
        const priorityOrder = { critical: 0, high: 1, medium: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      case 'cost':
        return (b.estimatedCost || 0) - (a.estimatedCost || 0);
      case 'stock':
        return a.currentStock - b.currentStock;
      default:
        return 0;
    }
  });

  const toggleProductSelection = (sku: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedProducts(newSelected);
  };

  const totalSelectedCost = sortedProducts
    .filter(product => selectedProducts.has(product.sku))
    .reduce((total, product) => total + (product.estimatedCost || 0), 0);

  const totalSelectedProfit = sortedProducts
    .filter(product => selectedProducts.has(product.sku))
    .reduce((total, product) => total + product.profitability.grossProfit, 0);

  const generatePurchaseOrder = () => {
    if (selectedProducts.size === 0) return;
    
    alert(`Orden generada: ${formatCurrency(totalSelectedCost)} | Ganancia estimada: ${formatCurrency(totalSelectedProfit)} | ROI promedio: ${Math.round(totalSelectedProfit / totalSelectedCost * 100)}%`);
  };


  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-navy-900" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Purchase Intelligence</h2>
              <p className="text-sm text-gray-500">Recomendaciones próximo contenedor</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-navy-900">{mockProducts.length}</div>
            <div className="text-sm text-gray-500">Productos analizados</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertCircle className="w-5 h-5 text-danger-600" />
              <span className="font-semibold text-danger-900">Crítico</span>
            </div>
            <div className="text-2xl font-bold text-danger-900">
              {mockProducts.filter(p => p.priority === 'critical').length}
            </div>
            <div className="text-sm text-danger-700">Stockout inminente</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-900">Alta Prioridad</span>
            </div>
            <div className="text-2xl font-bold text-amber-900">
              {mockProducts.filter(p => p.priority === 'high').length}
            </div>
            <div className="text-sm text-amber-700">Oportunidad detectada</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Inversión Total</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {formatCurrency(mockProducts.reduce((total, p) => total + (p.estimatedCost || 0), 0))}
            </div>
            <div className="text-sm text-blue-700">Contenedor completo</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Ordenar por:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'priority' | 'cost' | 'stock')}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="priority">Prioridad</option>
                <option value="cost">Costo</option>
                <option value="stock">Stock Actual</option>
              </select>
            </div>
          </div>

          {selectedProducts.size > 0 && (
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                {selectedProducts.size} productos • Costo: {formatCurrency(totalSelectedCost)} • Ganancia est.: {formatCurrency(totalSelectedProfit)}
              </div>
              <button
                onClick={generatePurchaseOrder}
                className="btn-primary flex items-center space-x-2"
              >
                <Calendar className="w-4 h-4" />
                <span>Generar Orden</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Seleccionar</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Producto</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Stock</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Orden Requerida</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Proveedor Único</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Lead Time</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Costo Total</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Riesgo Supply</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product) => (
                <tr 
                  key={product.sku} 
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selectedProducts.has(product.sku) ? 'bg-navy-50' : ''
                  }`}
                >
                  <td className="py-5 px-6">
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(product.sku)}
                      onChange={() => toggleProductSelection(product.sku)}
                      className="w-4 h-4 text-navy-900 border-gray-300 rounded focus:ring-navy-500"
                    />
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500">{product.sku}</div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <span className={`font-medium ${
                      product.currentStock === 0 ? 'text-danger-600' : 
                      product.currentStock < 1000 ? 'text-amber-600' : 'text-gray-900'
                    }`}>
                      {product.currentStock.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className={`font-medium ${
                        !product.supplyChainConstraints.isMinimumMet ? 'text-amber-600' : 'text-gray-900'
                      }`}>
                        {product.supplyChainConstraints.adjustedOrderQty.toLocaleString()}
                        {!product.supplyChainConstraints.isMinimumMet && (
                          <span className="text-xs text-amber-600 ml-1">↑</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {!product.supplyChainConstraints.isMinimumMet 
                          ? `Recom: ${product.recommendedOrder.toLocaleString()} | Mín: ${product.minimumOrderQty.toLocaleString()}`
                          : `Mínimo: ${product.minimumOrderQty.toLocaleString()}`
                        }
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {product.primarySupplier.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {product.primarySupplier.country} • {product.primarySupplier.type}
                      </div>
                      <div className="text-xs text-blue-600">
                        {product.primarySupplier.paymentTerms}
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div className={`font-medium ${
                      product.leadTimeDays <= 7 ? 'text-success-600' :
                      product.leadTimeDays <= 15 ? 'text-amber-600' : 'text-danger-600'
                    }`}>
                      {product.leadTimeDays} días
                    </div>
                    <div className="text-xs text-gray-500">
                      {product.primarySupplier.type === 'local' ? '🇻🇪 Local' :
                       product.primarySupplier.type === 'regional' ? '🌎 Regional' : '🌍 Internacional'}
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className="font-medium text-gray-900">
                        {product.estimatedCost ? formatCurrency(product.estimatedCost) : 'N/A'}
                      </div>
                      <div className="text-sm text-success-600">
                        +{formatCurrency(product.profitability.grossProfit)}
                      </div>
                      <div className="text-xs text-gray-500">
                        ${(product.estimatedCost! / product.supplyChainConstraints.adjustedOrderQty).toFixed(2)}/unit
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className={`font-medium ${
                        product.supplyChainConstraints.supplyRisk === 'low' ? 'text-success-600' :
                        product.supplyChainConstraints.supplyRisk === 'medium' ? 'text-amber-600' : 'text-danger-600'
                      }`}>
                        {product.supplyChainConstraints.supplyRisk === 'low' ? 'Bajo' :
                         product.supplyChainConstraints.supplyRisk === 'medium' ? 'Medio' : 'Alto'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {product.alternativeSuppliers && product.alternativeSuppliers.length > 0 
                          ? `+${product.alternativeSuppliers.length} backup`
                          : 'Sin backup'}
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-sm font-medium border ${getPriorityColor(product.priority)}`}>
                      {getPriorityIcon(product.priority)}
                      <span className="capitalize">{product.priority === 'critical' ? 'Crítico' : product.priority === 'high' ? 'Alto' : 'Medio'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurchaseIntelligence;