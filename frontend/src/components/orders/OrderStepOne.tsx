import { useState } from 'react';
import type { OrderData } from './OrderWizard';

// Configuración hardcodeada para Región Caracas
const REGION_CARACAS = {
  cedi: {
    id: 'cedi_caracas',
    nombre: 'CEDI Caracas'
  },
  tiendas: [
    { id: 'tienda_17', nombre: 'ARTIGAS' },
    { id: 'tienda_18', nombre: 'PARAISO' }
  ]
};

interface Props {
  orderData: OrderData;
  updateOrderData: (data: Partial<OrderData>) => void;
  onNext: () => void;
  onCancel: () => void;
}

export default function OrderStepOne({ orderData, updateOrderData, onNext, onCancel }: Props) {
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState(orderData.tienda_destino || '');

  // Auto-seleccionar CEDI Caracas al montar
  useState(() => {
    if (!orderData.cedi_origen) {
      updateOrderData({
        cedi_origen: REGION_CARACAS.cedi.id,
        cedi_origen_nombre: REGION_CARACAS.cedi.nombre,
      });
    }
  });

  const handleTiendaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tienda = REGION_CARACAS.tiendas.find(t => t.id === e.target.value);
    setTiendaSeleccionada(e.target.value);
    updateOrderData({
      cedi_origen: REGION_CARACAS.cedi.id,
      cedi_origen_nombre: REGION_CARACAS.cedi.nombre,
      tienda_destino: e.target.value,
      tienda_destino_nombre: tienda?.nombre || '',
    });
  };

  const canProceed = tiendaSeleccionada;
  const tiendaInfo = REGION_CARACAS.tiendas.find(t => t.id === tiendaSeleccionada);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="space-y-6">
          {/* Título */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Seleccionar Origen y Destino</h2>
            <p className="mt-2 text-sm text-gray-500">
              Pedido desde CEDI Caracas hacia tiendas de la región.
            </p>
          </div>

          {/* CEDI Origen - Fijo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CEDI Origen
            </label>
            <div className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-md text-gray-700">
              {REGION_CARACAS.cedi.nombre}
            </div>
          </div>

          {/* Tienda Destino */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tienda Destino <span className="text-red-500">*</span>
            </label>
            <select
              value={tiendaSeleccionada}
              onChange={handleTiendaChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="">Seleccionar Tienda...</option>
              {REGION_CARACAS.tiendas.map((tienda) => (
                <option key={tienda.id} value={tienda.id}>
                  {tienda.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Información de selección */}
          {tiendaSeleccionada && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Resumen de Selección</h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Origen:</span> {REGION_CARACAS.cedi.nombre}
                </p>
                <p>
                  <span className="font-medium">Destino:</span> {tiendaInfo?.nombre}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
          >
            Cancelar
          </button>
          <button
            onClick={onNext}
            disabled={!canProceed}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
