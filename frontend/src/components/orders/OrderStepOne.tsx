import { useState, useEffect } from 'react';
import type { OrderData } from './OrderWizard';

// Configuración de CEDIs y tiendas disponibles
const CEDIS_DISPONIBLES = [
  { id: 'cedi_caracas', nombre: 'CEDI Caracas', region: 'Caracas' },
  { id: 'cedi_seco', nombre: 'CEDI Seco', region: 'Valencia' }
];

const TIENDAS_POR_CEDI: Record<string, Array<{ id: string; nombre: string }>> = {
  'cedi_caracas': [
    { id: 'tienda_17', nombre: 'ARTIGAS' },
    { id: 'tienda_18', nombre: 'PARAISO' }
  ],
  'cedi_seco': [
    { id: 'tienda_01', nombre: 'PERIFERICO' },
    { id: 'tienda_02', nombre: 'AV. BOLIVAR' },
    { id: 'tienda_03', nombre: 'MAÑONGO' },
    { id: 'tienda_04', nombre: 'SAN DIEGO' },
    { id: 'tienda_05', nombre: 'VIVIENDA' },
    { id: 'tienda_06', nombre: 'NAGUANAGUA' },
    { id: 'tienda_07', nombre: 'CENTRO' },
    { id: 'tienda_08', nombre: 'BOSQUE' },
    { id: 'tienda_09', nombre: 'GUACARA' },
    { id: 'tienda_10', nombre: 'FERIAS' },
    { id: 'tienda_11', nombre: 'FLOR AMARILLO' },
    { id: 'tienda_12', nombre: 'PARAPARAL' },
    { id: 'tienda_13', nombre: 'PARAMACAY' },
    { id: 'tienda_15', nombre: 'ISABELICA' },
    { id: 'tienda_16', nombre: 'TOCUYITO' },
    { id: 'tienda_19', nombre: 'GUIGUE' },
    { id: 'tienda_20', nombre: 'TAZAJAL' }
  ]
};

interface Props {
  orderData: OrderData;
  updateOrderData: (data: Partial<OrderData>) => void;
  onNext: () => void;
  onCancel: () => void;
}

export default function OrderStepOne({ orderData, updateOrderData, onNext, onCancel }: Props) {
  const [cediSeleccionado, setCediSeleccionado] = useState(orderData.cedi_origen || 'cedi_seco');
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState(orderData.tienda_destino || '');

  const tiendasDisponibles = TIENDAS_POR_CEDI[cediSeleccionado] || [];

  // Auto-seleccionar CEDI al montar
  useEffect(() => {
    if (!orderData.cedi_origen) {
      const cedi = CEDIS_DISPONIBLES.find(c => c.id === cediSeleccionado);
      if (cedi) {
        updateOrderData({
          cedi_origen: cedi.id,
          cedi_origen_nombre: cedi.nombre,
        });
      }
    }
  }, []);

  const handleCediChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nuevoCedi = e.target.value;
    const cedi = CEDIS_DISPONIBLES.find(c => c.id === nuevoCedi);
    setCediSeleccionado(nuevoCedi);
    setTiendaSeleccionada(''); // Reset tienda cuando cambia CEDI
    updateOrderData({
      cedi_origen: cedi?.id || '',
      cedi_origen_nombre: cedi?.nombre || '',
      tienda_destino: '',
      tienda_destino_nombre: '',
    });
  };

  const handleTiendaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tienda = tiendasDisponibles.find(t => t.id === e.target.value);
    setTiendaSeleccionada(e.target.value);
    updateOrderData({
      tienda_destino: e.target.value,
      tienda_destino_nombre: tienda?.nombre || '',
    });
  };

  const canProceed = cediSeleccionado && tiendaSeleccionada;
  const cediInfo = CEDIS_DISPONIBLES.find(c => c.id === cediSeleccionado);
  const tiendaInfo = tiendasDisponibles.find(t => t.id === tiendaSeleccionada);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="space-y-6">
          {/* Título */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Seleccionar Origen y Destino</h2>
            <p className="mt-2 text-sm text-gray-500">
              Pedido desde CEDI hacia tiendas de la región.
            </p>
          </div>

          {/* CEDI Origen - Seleccionable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CEDI Origen <span className="text-red-500">*</span>
            </label>
            <select
              value={cediSeleccionado}
              onChange={handleCediChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {CEDIS_DISPONIBLES.map((cedi) => (
                <option key={cedi.id} value={cedi.id}>
                  {cedi.nombre}
                </option>
              ))}
            </select>
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
              {tiendasDisponibles.map((tienda) => (
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
                  <span className="font-medium">Origen:</span> {cediInfo?.nombre}
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
