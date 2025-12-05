import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

// Importar pasos
import PasoOrigenDestino from './wizard-v2/PasoOrigenDestino';
import PasoSeleccionProductosV2Extended from './wizard-v2/PasoSeleccionProductosV2Extended';
import PasoConfirmacion from './wizard-v2/PasoConfirmacion';

interface PedidoSugeridoV2WizardProps {
  isOpen: boolean;
  onClose: () => void;
  onPedidoCreado?: (pedidoId: string) => void;
}

export interface DatosOrigenDestino {
  cediOrigenId: string;
  cediOrigenNombre: string;
  tiendaDestinoId: string;
  tiendaDestinoNombre: string;
  fechaPedido: string;
}

export interface ProductoSeleccionado {
  // Identificación
  producto_id: string;
  nombre_producto: string;
  matriz_abc_xyz: string;
  cuadrante: string;  // Cuadrante numérico (I, II, III, etc.)

  // Cantidades
  cantidad_sugerida: number;
  cantidad_pedida: number; // Puede ser ajustada por el usuario (campo PEDIR)

  // Promedios de demanda
  demanda_promedio_diaria: number;
  demanda_5_dias: number;
  demanda_20_dias: number;
  demanda_mismo_dia: number;
  demanda_proyeccion: number;

  // Stock detallado
  stock_actual: number;
  stock_cedi: number;
  inventario_en_transito: number;
  stock_total: number;
  dias_stock_actual: number;

  // Parámetros de reorden
  stock_minimo: number;
  stock_seguridad: number;
  punto_reorden: number;
  stock_maximo: number;

  // Nivel objetivo
  demanda_ciclo: number;
  nivel_objetivo: number;

  // Metadata
  prioridad: number;
  peso_kg: number;
  unidad_medida: string;

  // Campos editables adicionales
  notas?: string; // Campo NOTAS - texto libre
}

export default function PedidoSugeridoV2Wizard({
  isOpen,
  onClose,
  onPedidoCreado
}: PedidoSugeridoV2WizardProps) {
  const [pasoActual, setPasoActual] = useState(1);
  const [datosOrigenDestino, setDatosOrigenDestino] = useState<DatosOrigenDestino | null>(null);
  const [productosSeleccionados, setProductosSeleccionados] = useState<ProductoSeleccionado[]>([]);

  if (!isOpen) return null;

  const handleSiguiente = () => {
    if (pasoActual < 3) {
      setPasoActual(pasoActual + 1);
    }
  };

  const handleAnterior = () => {
    if (pasoActual > 1) {
      setPasoActual(pasoActual - 1);
    }
  };

  const handleCancelar = () => {
    if (window.confirm('¿Estás seguro de cancelar? Se perderán todos los cambios.')) {
      setPasoActual(1);
      setDatosOrigenDestino(null);
      setProductosSeleccionados([]);
      onClose();
    }
  };

  const handlePaso1Completado = (datos: DatosOrigenDestino) => {
    setDatosOrigenDestino(datos);
    handleSiguiente();
  };

  const handlePaso2Completado = (productos: ProductoSeleccionado[]) => {
    setProductosSeleccionados(productos);
    handleSiguiente();
  };

  const handlePedidoCreado = (pedidoId: string) => {
    setPasoActual(1);
    setDatosOrigenDestino(null);
    setProductosSeleccionados([]);
    onPedidoCreado?.(pedidoId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">📦</div>
              <div>
                <h2 className="text-xl font-bold">Crear Pedido Sugerido</h2>
                <p className="text-sm text-indigo-100">Región Caracas</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleCancelar}
            className="text-white hover:text-indigo-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="bg-gray-50 px-6 py-4 border-b">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {/* Paso 1 */}
            <div className="flex items-center flex-1">
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm
                ${pasoActual >= 1
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-300 text-gray-600'
                }
              `}>
                1
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${pasoActual >= 1 ? 'text-gray-900' : 'text-gray-500'}`}>
                  Origen y Destino
                </p>
                <p className="text-xs text-gray-500">CEDI → Tienda</p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-gray-400 mx-2" />

            {/* Paso 2 */}
            <div className="flex items-center flex-1">
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm
                ${pasoActual >= 2
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-300 text-gray-600'
                }
              `}>
                2
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${pasoActual >= 2 ? 'text-gray-900' : 'text-gray-500'}`}>
                  Productos
                </p>
                <p className="text-xs text-gray-500">Seleccionar items</p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-gray-400 mx-2" />

            {/* Paso 3 */}
            <div className="flex items-center flex-1">
              <div className={`
                flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm
                ${pasoActual >= 3
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-300 text-gray-600'
                }
              `}>
                3
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${pasoActual >= 3 ? 'text-gray-900' : 'text-gray-500'}`}>
                  Confirmación
                </p>
                <p className="text-xs text-gray-500">Revisar y crear</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {pasoActual === 1 && (
            <PasoOrigenDestino
              onSiguiente={handlePaso1Completado}
              onCancelar={handleCancelar}
            />
          )}

          {pasoActual === 2 && datosOrigenDestino && (
            <PasoSeleccionProductosV2Extended
              datosOrigenDestino={datosOrigenDestino}
              onSiguiente={handlePaso2Completado}
              onAnterior={handleAnterior}
            />
          )}

          {pasoActual === 3 && datosOrigenDestino && (
            <PasoConfirmacion
              datosOrigenDestino={datosOrigenDestino}
              productosSeleccionados={productosSeleccionados}
              onAnterior={handleAnterior}
              onPedidoCreado={handlePedidoCreado}
            />
          )}
        </div>

        {/* Footer Info */}
        <div className="bg-indigo-50 px-6 py-3 text-xs text-indigo-700 border-t border-indigo-200">
          <p>
            ℹ️ Este pedido utiliza el método de Nivel Objetivo basado en
            clasificación ABC-XYZ con análisis de 8 semanas de demanda histórica.
          </p>
        </div>
      </div>
    </div>
  );
}
