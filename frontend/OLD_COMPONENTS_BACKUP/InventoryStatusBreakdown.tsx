import React, { useState } from 'react';
import { Package, Clock, Truck, Ship, ShoppingCart, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { inventoryFlow, productInventoryDetails } from '../data/mockData';
import type { ProductInventory } from '../types';

const InventoryStatusBreakdown: React.FC = () => {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Package':
        return Package;
      case 'Clock':
        return Clock;
      case 'Truck':
        return Truck;
      case 'Ship':
        return Ship;
      case 'ShoppingCart':
        return ShoppingCart;
      default:
        return Package;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatQuantity = (quantity: number) => {
    return new Intl.NumberFormat('es-VE').format(quantity);
  };

  const getFilteredProducts = (status: string) => {
    return productInventoryDetails.filter(product => 
      product.statuses.some(s => s.status === status && s.quantity > 0)
    );
  };

  const getProductStatusValue = (product: ProductInventory, status: string) => {
    const statusData = product.statuses.find(s => s.status === status);
    return statusData ? statusData.quantity : 0;
  };

  const getProductStatusDetails = (product: ProductInventory, status: string) => {
    const statusData = product.statuses.find(s => s.status === status);
    return statusData?.details || '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Estado del Inventario</h3>
          <p className="text-sm text-gray-500">Visibilidad completa del flujo de mercancía</p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-2 text-sm text-navy-900 hover:text-navy-700 transition-colors"
        >
          <Eye className="w-4 h-4" />
          <span>{showDetails ? 'Ocultar' : 'Ver'} detalles</span>
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-5 gap-8">
        {inventoryFlow.map((status) => {
          const IconComponent = getIcon(status.icon);
          return (
            <div
              key={status.status}
              className={`card card-hover cursor-pointer transition-all duration-200 min-h-[180px] ${
                selectedStatus === status.status ? 'ring-2 ring-navy-500 bg-navy-50' : ''
              }`}
              onClick={() => setSelectedStatus(selectedStatus === status.status ? null : status.status)}
            >
              {/* Header */}
              <div className="flex items-start space-x-3 mb-4">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${status.color}20` }}
                >
                  <IconComponent 
                    className="w-6 h-6" 
                    style={{ color: status.color }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 text-sm leading-tight">{status.label}</h4>
                  <p className="text-xs text-gray-500 mt-1">{status.percentage}% del total</p>
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-bold text-gray-900 leading-none">
                    {formatQuantity(status.quantity)}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">unidades</div>
                </div>
                
                <div>
                  <div className="text-lg font-bold leading-none" style={{ color: status.color }}>
                    {formatCurrency(status.value)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 leading-tight">{status.description}</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${status.percentage}%`,
                      backgroundColor: status.color 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed View */}
      {showDetails && selectedStatus && (
        <div className="card animate-fade-in">
          <div className="flex items-center space-x-3 mb-4">
            {(() => {
              const status = inventoryFlow.find(s => s.status === selectedStatus);
              const IconComponent = status ? getIcon(status.icon) : Package;
              return (
                <>
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${status?.color}20` }}
                  >
                    <IconComponent 
                      className="w-4 h-4" 
                      style={{ color: status?.color }}
                    />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">
                    Productos en Estado: {status?.label}
                  </h4>
                </>
              );
            })()}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Producto</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Cantidad</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Valor</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Detalles</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-900">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredProducts(selectedStatus).map((product) => {
                  const quantity = getProductStatusValue(product, selectedStatus);
                  const details = getProductStatusDetails(product, selectedStatus);
                  const statusInfo = product.statuses.find(s => s.status === selectedStatus);
                  
                  return (
                    <tr key={product.sku} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <div>
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-sm text-gray-500">{product.sku} • {product.category}</div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-gray-900">
                          {formatQuantity(quantity)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-gray-900">
                          {formatCurrency(statusInfo?.value || 0)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm text-gray-600">{details || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm text-gray-500">{product.lastUpdated}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {getFilteredProducts(selectedStatus).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No hay productos en este estado actualmente
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card text-center py-6">
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {formatQuantity(inventoryFlow.reduce((sum, status) => sum + status.quantity, 0))}
          </div>
          <div className="text-sm text-gray-500 font-medium">Total Unidades</div>
        </div>
        
        <div className="card text-center py-6">
          <div className="text-3xl font-bold text-navy-900 mb-2">
            {formatCurrency(inventoryFlow.reduce((sum, status) => sum + status.value, 0))}
          </div>
          <div className="text-sm text-gray-500 font-medium">Valor Total</div>
        </div>

        <div className="card text-center py-6">
          <div className="text-3xl font-bold text-success-600 mb-2">
            {inventoryFlow.find(s => s.status === 'available')?.percentage.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 font-medium">Disponible Inmediato</div>
        </div>
      </div>
    </div>
  );
};

export default InventoryStatusBreakdown;