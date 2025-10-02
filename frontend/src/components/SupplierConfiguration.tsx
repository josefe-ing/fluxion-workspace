import React, { useState } from 'react';
import { Plus, Edit, Trash2, Building, MapPin, Clock, Package, DollarSign, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { SupplierConfiguration as SupplierConfig } from '../types';

const SupplierConfiguration: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierConfig[]>([
    {
      id: 'SUP001',
      name: 'Savoy Venezuela C.A.',
      contactInfo: {
        email: 'ventas@savoy.com.ve',
        phone: '+58-212-555-0123',
        address: 'Zona Industrial Los Ruices, Caracas'
      },
      country: 'Venezuela',
      leadTimeDays: 15,
      minimumOrder: 30000,
      paymentTerms: '30 días net',
      currency: 'USD',
      reliability: 'high',
      isActive: true,
      products: ['SAV_001'],
      createdAt: '2024-01-15',
      updatedAt: '2024-08-12'
    },
    {
      id: 'SUP002',
      name: 'Adams Chiclets Venezuela',
      contactInfo: {
        email: 'ventas@adamschiclets.com.ve',
        phone: '+58-212-555-0189',
        address: 'Av. Libertador, Torre Caracas, Piso 12, Caracas'
      },
      country: 'Venezuela',
      leadTimeDays: 7,
      minimumOrder: 15000,
      paymentTerms: '15 días',
      currency: 'USD',
      reliability: 'high',
      isActive: true,
      products: ['CHI_001'],
      createdAt: '2024-02-01',
      updatedAt: '2024-08-10'
    },
    {
      id: 'SUP003',
      name: 'Dulces Colombia S.A.S.',
      contactInfo: {
        email: 'pedidos@dulcescolombia.co',
        phone: '+57-1-555-0167',
        address: 'Calle 100 #15-23, Zona Franca, Bogotá'
      },
      country: 'Colombia',
      leadTimeDays: 12,
      minimumOrder: 20000,
      paymentTerms: '21 días',
      currency: 'USD',
      reliability: 'medium',
      isActive: true,
      products: ['CHU_001', 'CAR_001'],
      createdAt: '2024-01-20',
      updatedAt: '2024-08-08'
    },
    {
      id: 'SUP004',
      name: 'Jet Chocolates C.A.',
      contactInfo: {
        email: 'ventas@jetchocolates.com.ve',
        phone: '+58-212-555-0145',
        address: 'Zona Industrial Los Ruices, Caracas'
      },
      country: 'Venezuela',
      leadTimeDays: 5,
      minimumOrder: 25000,
      paymentTerms: '7 días',
      currency: 'USD',
      reliability: 'high',
      isActive: true,
      products: ['CHO_001'],
      createdAt: '2024-03-01',
      updatedAt: '2024-08-11'
    }
  ]);


  const getReliabilityColor = (reliability: string) => {
    switch (reliability) {
      case 'high': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-amber-600 bg-amber-50';
      case 'low': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getReliabilityIcon = (reliability: string) => {
    switch (reliability) {
      case 'high': return <CheckCircle className="w-4 h-4" />;
      case 'medium': return <AlertTriangle className="w-4 h-4" />;
      case 'low': return <XCircle className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const productMapping: Record<string, string> = {
    'SAV_001': 'Savoy Tango 20g',
    'CHI_001': 'Chiclets Adams Tutti-Frutti 100u',
    'CHU_001': 'Chupetas Pico Dulce 100u',
    'CAR_001': 'Caramelos Halls Mentol 25u',
    'CHO_001': 'Chocolates Jet 30g'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Configuración de Proveedores</h3>
          <p className="text-sm text-gray-600">Gestiona tu red de proveedores, lead times y productos</p>
        </div>
        <button
          onClick={() => alert('Funcionalidad de agregar proveedor en desarrollo')}
          className="flex items-center space-x-2 px-4 py-2 bg-navy-600 text-white rounded-md hover:bg-navy-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Proveedor</span>
        </button>
      </div>

      {/* Suppliers Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center">
              <Building className="w-5 h-5 text-navy-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{suppliers.filter(s => s.isActive).length}</p>
              <p className="text-sm text-gray-500">Activos</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{suppliers.filter(s => s.reliability === 'high').length}</p>
              <p className="text-sm text-gray-500">Alta Confiabilidad</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(suppliers.reduce((acc, s) => acc + s.leadTimeDays, 0) / suppliers.length)}
              </p>
              <p className="text-sm text-gray-500">Lead Time Promedio</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {suppliers.reduce((acc, s) => acc + s.products.length, 0)}
              </p>
              <p className="text-sm text-gray-500">Productos Totales</p>
            </div>
          </div>
        </div>
      </div>

      {/* Suppliers List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Proveedor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  País/Lead Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mínimo/Términos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Productos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confiabilidad
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          supplier.isActive ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          <Building className={`h-5 w-5 ${
                            supplier.isActive ? 'text-green-600' : 'text-gray-400'
                          }`} />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        <div className="text-sm text-gray-500">{supplier.contactInfo.email}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-900">{supplier.country}</div>
                        <div className="text-sm text-gray-500 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{supplier.leadTimeDays} días</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900 flex items-center space-x-1">
                        <DollarSign className="w-3 h-3" />
                        <span>{formatCurrency(supplier.minimumOrder, supplier.currency)}</span>
                      </div>
                      <div className="text-sm text-gray-500">{supplier.paymentTerms}</div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {supplier.products.map(productSku => (
                        <span
                          key={productSku}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {productMapping[productSku] || productSku}
                        </span>
                      ))}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getReliabilityColor(supplier.reliability)}`}>
                      {getReliabilityIcon(supplier.reliability)}
                      <span className="capitalize">{supplier.reliability}</span>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => alert('Funcionalidad de editar proveedor en desarrollo')}
                        className="text-navy-600 hover:text-navy-900"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('¿Estás seguro de que quieres eliminar este proveedor?')) {
                            setSuppliers(suppliers.filter(s => s.id !== supplier.id));
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product-Supplier Mapping */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Mapeo Producto-Proveedor</h3>
        <div className="space-y-3">
          {Object.entries(productMapping).map(([sku, productName]) => {
            const primarySupplier = suppliers.find(s => s.products.includes(sku));
            const alternativeSuppliers = suppliers.filter(s => s.products.includes(sku) && s.id !== primarySupplier?.id);
            
            return (
              <div key={sku} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{productName}</div>
                  <div className="text-sm text-gray-500">SKU: {sku}</div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div>
                    <span className="text-sm text-gray-500">Proveedor Principal:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {primarySupplier?.name || 'No asignado'}
                    </span>
                  </div>
                  
                  {alternativeSuppliers.length > 0 && (
                    <div>
                      <span className="text-sm text-gray-500">Alternativos:</span>
                      <span className="ml-2 text-sm text-blue-600">
                        +{alternativeSuppliers.length}
                      </span>
                    </div>
                  )}
                  
                  <button className="text-navy-600 hover:text-navy-900">
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SupplierConfiguration;