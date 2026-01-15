import { useState } from 'react';
import { Building2, Store } from 'lucide-react';
import type { DatosOrigenDestino } from '../PedidoSugeridoV2Wizard';

interface PasoOrigenDestinoProps {
  onSiguiente: (datos: DatosOrigenDestino) => void;
  onCancelar: () => void;
}

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
    { id: 'tienda_08', nombre: 'BOSQUE' },
    { id: 'tienda_01', nombre: 'PERIFERICO' },
    { id: 'tienda_02', nombre: 'AV. BOLIVAR' },
    { id: 'tienda_03', nombre: 'MAÑONGO' },
    { id: 'tienda_15', nombre: 'ISABELICA' },
    { id: 'tienda_20', nombre: 'TAZAJAL' }
  ]
};

export default function PasoOrigenDestino({ onSiguiente, onCancelar }: PasoOrigenDestinoProps) {
  const [cediSeleccionado, setCediSeleccionado] = useState('cedi_seco');
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState('');
  const [fechaPedido, setFechaPedido] = useState(
    new Date().toISOString().split('T')[0]
  );

  const tiendasDisponibles = TIENDAS_POR_CEDI[cediSeleccionado] || [];

  const handleCediChange = (nuevoCedi: string) => {
    setCediSeleccionado(nuevoCedi);
    setTiendaSeleccionada(''); // Reset tienda cuando cambia CEDI
  };

  const handleSiguiente = () => {
    if (!tiendaSeleccionada) {
      alert('Por favor selecciona una tienda de destino');
      return;
    }

    const cedi = CEDIS_DISPONIBLES.find(c => c.id === cediSeleccionado);
    const tienda = tiendasDisponibles.find(t => t.id === tiendaSeleccionada);

    if (!cedi || !tienda) {
      alert('Error al obtener datos del CEDI o tienda');
      return;
    }

    onSiguiente({
      cediOrigenId: cedi.id,
      cediOrigenNombre: cedi.nombre,
      tiendaDestinoId: tienda.id,
      tiendaDestinoNombre: tienda.nombre,
      fechaPedido
    });
  };

  const puedeAvanzar = cediSeleccionado && tiendaSeleccionada && fechaPedido;
  const cediInfo = CEDIS_DISPONIBLES.find(c => c.id === cediSeleccionado);
  const tiendaInfo = tiendasDisponibles.find(t => t.id === tiendaSeleccionada);

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Seleccionar Origen y Destino
          </h3>
          <p className="text-gray-600">
            Pedido desde CEDI hacia tiendas de la región.
          </p>
        </div>

        <div className="space-y-6">
          {/* CEDI Origen - Seleccionable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="inline h-4 w-4 mr-1" />
              CEDI Origen
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={cediSeleccionado}
              onChange={(e) => handleCediChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
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
              <Store className="inline h-4 w-4 mr-1" />
              Tienda Destino
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={tiendaSeleccionada}
              onChange={(e) => setTiendaSeleccionada(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            >
              <option value="">Seleccionar Tienda...</option>
              {tiendasDisponibles.map((tienda) => (
                <option key={tienda.id} value={tienda.id}>
                  {tienda.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha del Pedido */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha del Pedido
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="date"
              value={fechaPedido}
              onChange={(e) => setFechaPedido(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
            />
          </div>

          {/* Preview Resumen */}
          {tiendaSeleccionada && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
              <p className="text-sm font-medium text-indigo-900 mb-2">Resumen:</p>
              <div className="space-y-1 text-sm text-indigo-800">
                <p>
                  <strong>Desde:</strong> {cediInfo?.nombre}
                </p>
                <p>
                  <strong>Hacia:</strong> {tiendaInfo?.nombre}
                </p>
                <p>
                  <strong>Fecha:</strong> {new Date(fechaPedido).toLocaleDateString('es-VE', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="mt-8 flex justify-between items-center">
          <button
            onClick={onCancelar}
            className="px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancelar
          </button>

          <button
            onClick={handleSiguiente}
            disabled={!puedeAvanzar}
            className={`
              px-6 py-2.5 rounded-lg font-medium transition-colors
              ${puedeAvanzar
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
