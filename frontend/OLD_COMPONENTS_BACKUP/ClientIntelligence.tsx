import React, { useState } from 'react';
import { Users, TrendingUp, AlertTriangle, Phone, Mail, Calendar, DollarSign } from 'lucide-react';
import { mockClients } from '../data/mockData';
import type { ClientIntelligence as ClientType } from '../types';

const ClientIntelligence: React.FC = () => {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'overdue' | 'new_pattern'>('all');

  const getStatusColor = (status: ClientType['status']) => {
    switch (status) {
      case 'active':
        return 'bg-success-100 text-success-800 border-success-200';
      case 'overdue':
        return 'bg-danger-100 text-danger-800 border-danger-200';
      case 'new_pattern':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: ClientType['status']) => {
    switch (status) {
      case 'active':
        return <TrendingUp className="w-4 h-4 text-success-600" />;
      case 'overdue':
        return <AlertTriangle className="w-4 h-4 text-danger-600" />;
      case 'new_pattern':
        return <TrendingUp className="w-4 h-4 text-amber-600" />;
      default:
        return <Users className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusLabel = (status: ClientType['status']) => {
    switch (status) {
      case 'active':
        return 'Activo';
      case 'overdue':
        return 'Overdue';
      case 'new_pattern':
        return 'Nuevo Patrón';
      default:
        return 'Desconocido';
    }
  };

  const getProbabilityColor = (probability: number) => {
    if (probability >= 80) return 'text-success-600';
    if (probability >= 50) return 'text-amber-600';
    if (probability > 0) return 'text-danger-600';
    return 'text-gray-400';
  };

  const filteredClients = mockClients.filter(client => {
    if (filterStatus === 'all') return true;
    return client.status === filterStatus;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const contactClient = (clientName: string, method: 'phone' | 'email') => {
    alert(`Iniciando contacto con ${clientName} vía ${method === 'phone' ? 'teléfono' : 'email'}`);
  };

  const scheduleFollowUp = (clientName: string) => {
    alert(`Follow-up programado para ${clientName}`);
  };

  const totalMonthlyProfit = mockClients.reduce((total, client) => total + client.profitability.grossProfitMonthly, 0);
  const overdueClients = mockClients.filter(client => client.status === 'overdue').length;
  const highProbabilityClients = mockClients.filter(client => client.probability >= 80).length;
  const highProfitabilityClients = mockClients.filter(client => client.profitability.profitabilityScore === 'high').length;

  const getProfitabilityColor = (score: string) => {
    switch (score) {
      case 'high': return 'text-success-600';
      case 'medium': return 'text-amber-600';
      case 'low': return 'text-danger-600';
      default: return 'text-gray-600';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing': return 'text-success-600';
      case 'stable': return 'text-blue-600';
      case 'decreasing': return 'text-danger-600';
      default: return 'text-gray-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return '📈';
      case 'stable': return '➡️';
      case 'decreasing': return '📉';
      default: return '➡️';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-navy-900" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Client Intelligence</h2>
              <p className="text-sm text-gray-500">Predicciones y patrones de clientes</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-navy-900">{mockClients.length}</div>
            <div className="text-sm text-gray-500">Clientes analizados</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="bg-success-50 border border-success-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-success-600" />
              <span className="font-semibold text-success-900">Alta Probabilidad</span>
            </div>
            <div className="text-2xl font-bold text-success-900">{highProbabilityClients}</div>
            <div className="text-sm text-success-700">Pedido próximo</div>
          </div>

          <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-danger-600" />
              <span className="font-semibold text-danger-900">Overdue</span>
            </div>
            <div className="text-2xl font-bold text-danger-900">{overdueClients}</div>
            <div className="text-sm text-danger-700">Requieren contacto</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Ganancia Mensual</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {formatCurrency(totalMonthlyProfit)}
            </div>
            <div className="text-sm text-blue-700">Total profit</div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-emerald-900">Alta Rentabilidad</span>
            </div>
            <div className="text-2xl font-bold text-emerald-900">{highProfitabilityClients}</div>
            <div className="text-sm text-emerald-700">Clientes premium</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Users className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-900">Nuevos Patrones</span>
            </div>
            <div className="text-2xl font-bold text-amber-900">
              {mockClients.filter(c => c.status === 'new_pattern').length}
            </div>
            <div className="text-sm text-amber-700">Cambio comportamiento</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Filtrar por estado:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
          >
            <option value="all">Todos los clientes</option>
            <option value="active">Activos</option>
            <option value="overdue">Overdue</option>
            <option value="new_pattern">Nuevos Patrones</option>
          </select>
          <div className="text-sm text-gray-500">
            Mostrando {filteredClients.length} de {mockClients.length} clientes
          </div>
        </div>
      </div>

      {/* Clients Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Cliente</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Próximo Pedido</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Prob.</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Ganancia Mensual</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Margen / LTV</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Recurrencia</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Estado</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr 
                  key={client.id} 
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selectedClient === client.id ? 'bg-navy-50' : ''
                  }`}
                  onClick={() => setSelectedClient(selectedClient === client.id ? null : client.id)}
                >
                  <td className="py-5 px-6">
                    <div className="font-medium text-gray-900">{client.name}</div>
                    <div className="text-sm text-gray-500">{client.id}</div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <span className={`text-sm font-medium ${
                        client.nextOrderPredicted.includes('OVERDUE') ? 'text-danger-600' :
                        client.nextOrderPredicted.includes('3 días') ? 'text-success-600' :
                        'text-gray-900'
                      }`}>
                        {client.nextOrderPredicted}
                      </span>
                      <div className="text-xs text-gray-500">{client.lastOrder}</div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${getProbabilityColor(client.probability)}`}>
                        {client.probability > 0 ? `${client.probability}%` : '---'}
                      </span>
                      {client.probability >= 80 && (
                        <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                      )}
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className="font-medium text-gray-900">
                        {formatCurrency(client.profitability.grossProfitMonthly)}
                      </div>
                      <div className={`text-xs ${getProfitabilityColor(client.profitability.profitabilityScore)}`}>
                        {client.profitability.profitabilityScore === 'high' ? 'Alto' : 
                         client.profitability.profitabilityScore === 'medium' ? 'Medio' : 'Bajo'}
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className="font-medium text-gray-900">
                        {client.profitability.marginPercent}%
                      </div>
                      <div className="text-xs text-blue-600">
                        LTV: {formatCurrency(client.profitability.ltv)}
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div>
                      <div className="font-medium text-gray-900">
                        c/ {client.recurrence.averageDaysBetweenOrders} días
                      </div>
                      <div className={`text-xs flex items-center space-x-1 ${getTrendColor(client.recurrence.orderFrequencyTrend)}`}>
                        <span>{getTrendIcon(client.recurrence.orderFrequencyTrend)}</span>
                        <span>Score: {client.recurrence.consistencyScore}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-sm font-medium border ${getStatusColor(client.status)}`}>
                      {getStatusIcon(client.status)}
                      <span>{getStatusLabel(client.status)}</span>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div className="flex items-center space-x-2">
                      {client.status === 'overdue' ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              contactClient(client.name, 'phone');
                            }}
                            className="p-1 text-danger-600 hover:text-danger-800 transition-colors"
                            title="Llamar ahora"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              contactClient(client.name, 'email');
                            }}
                            className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                            title="Enviar email"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            scheduleFollowUp(client.name);
                          }}
                          className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
                          title="Programar follow-up"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client Details Modal-like section */}
      {selectedClient && (
        <div className="card bg-navy-50 border-navy-200">
          <h3 className="text-lg font-semibold text-navy-900 mb-4">Detalles del Cliente</h3>
          {(() => {
            const client = mockClients.find(c => c.id === selectedClient);
            if (!client) return null;
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Información General</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Cliente:</dt>
                      <dd className="font-medium text-gray-900">{client.name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Estado:</dt>
                      <dd className={`font-medium ${getStatusColor(client.status).includes('success') ? 'text-success-600' : 
                        getStatusColor(client.status).includes('danger') ? 'text-danger-600' : 'text-amber-600'}`}>
                        {getStatusLabel(client.status)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Volumen Mensual:</dt>
                      <dd className="font-medium text-gray-900">
                        {client.monthlyVolume ? formatCurrency(client.monthlyVolume) : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Predicciones</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Último Pedido:</dt>
                      <dd className="font-medium text-gray-900">{client.lastOrder}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Próximo Pedido:</dt>
                      <dd className={`font-medium ${
                        client.nextOrderPredicted.includes('OVERDUE') ? 'text-danger-600' : 'text-gray-900'
                      }`}>
                        {client.nextOrderPredicted}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Probabilidad:</dt>
                      <dd className={`font-medium ${getProbabilityColor(client.probability)}`}>
                        {client.probability > 0 ? `${client.probability}%` : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default ClientIntelligence;