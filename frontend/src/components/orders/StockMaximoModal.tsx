import { X, Zap, TrendingUp, Info, Package } from 'lucide-react';

interface StockMaximoModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    prom_p75_unid: number;
    cantidad_bultos: number;
    clasificacion_abc: string | null;
    clase_efectiva: string | null;
    es_generador_trafico: boolean;
    stock_maximo: number;
    punto_reorden: number;
    metodo_calculo: string;
  };
}

// Constantes del sistema (deben coincidir con backend)
const PARAMS_ABC = {
  'A': { diasCobertura: 7, descripcion: '1 semana - Alta rotación' },
  'B': { diasCobertura: 14, descripcion: '2 semanas - Rotación media' },
  'C': { diasCobertura: 30, descripcion: '1 mes - Baja rotación' },
};

export default function StockMaximoModal({ isOpen, onClose, producto }: StockMaximoModalProps) {
  if (!isOpen) return null;

  const claseEfectiva = producto.clase_efectiva || producto.clasificacion_abc || 'C';
  const params = PARAMS_ABC[claseEfectiva as keyof typeof PARAMS_ABC] || PARAMS_ABC['C'];

  // Valores calculados
  const demandaP75 = producto.prom_p75_unid;
  const demandaP75Bultos = demandaP75 / producto.cantidad_bultos;
  const unidadesPorBulto = producto.cantidad_bultos;

  // Stock máximo viene del backend (en unidades)
  const stockMaximoUnid = producto.stock_maximo;
  const stockMaximoBultos = stockMaximoUnid / unidadesPorBulto;
  const diasMaximo = demandaP75Bultos > 0 ? stockMaximoBultos / demandaP75Bultos : 0;

  // ROP viene del backend
  const ropUnid = producto.punto_reorden;
  const ropBultos = ropUnid / unidadesPorBulto;

  // Cálculos para mostrar la fórmula
  const demandaCiclo = demandaP75 * params.diasCobertura;
  const cantidadPedidoOptimo = stockMaximoUnid - ropUnid;
  const cantidadPedidoBultos = cantidadPedidoOptimo / unidadesPorBulto;

  const getColorClase = (clase: string) => {
    if (clase === 'A') return 'bg-red-100 text-red-800 border-red-300';
    if (clase === 'B') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-violet-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="text-purple-600" size={24} />
              Stock Máximo
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Cobertura: <span className="font-semibold">{params.diasCobertura} días ({params.descripcion})</span>
              {' • '}Clase: <span className={`px-2 py-0.5 rounded text-xs font-bold ${getColorClase(claseEfectiva)}`}>{claseEfectiva}</span>
              {producto.es_generador_trafico && (
                <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-bold">
                  <Zap className="inline w-3 h-3 mr-1" />
                  Generador Tráfico
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Producto Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Producto</p>
            <p className="font-mono text-sm font-bold text-gray-900">{producto.codigo_producto}</p>
            <p className="text-sm text-gray-700 mt-1">{producto.descripcion_producto}</p>
          </div>

          {/* Concepto Principal */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              ¿Qué es el Stock Máximo?
            </h3>
            <p className="text-sm text-gray-700">
              El <strong>Stock Máximo</strong> es el nivel máximo de inventario objetivo. Define:
            </p>
            <ul className="mt-2 text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>El techo de inventario que no debemos superar</li>
              <li>La cantidad óptima a pedir = Stock Máximo - Stock Actual</li>
              <li>La cobertura máxima en días según la clase ABC</li>
            </ul>
          </div>

          {/* Resultado Final */}
          <div className="bg-gradient-to-r from-purple-50 to-violet-50 border-2 border-purple-300 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-purple-900 mb-3">Resultado del Cálculo</h3>

            {/* Visualización de la relación */}
            <div className="mb-4 bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-center gap-2 text-sm">
                <div className="text-center px-3 py-2 bg-orange-100 rounded border border-orange-300">
                  <p className="text-xs text-orange-600">ROP</p>
                  <p className="font-mono font-bold text-orange-700">{ropUnid.toFixed(0)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">+</span>
                <div className="text-center px-3 py-2 bg-blue-100 rounded border border-blue-300">
                  <p className="text-xs text-blue-600">Demanda × {params.diasCobertura}d</p>
                  <p className="font-mono font-bold text-blue-700">{demandaCiclo.toFixed(0)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">=</span>
                <div className="text-center px-3 py-2 bg-purple-100 rounded border-2 border-purple-400">
                  <p className="text-xs text-purple-600">Stock Máximo</p>
                  <p className="font-mono font-bold text-purple-700 text-lg">{stockMaximoUnid.toFixed(0)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-white rounded-lg border border-purple-200">
                <p className="text-xs text-gray-600 mb-1">Stock Máximo</p>
                <p className="text-2xl font-bold text-purple-700">{stockMaximoUnid.toFixed(0)}</p>
                <p className="text-sm text-purple-600">unidades</p>
                <p className="text-xs text-gray-500 mt-1">({stockMaximoBultos.toFixed(1)} bultos)</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Días Cobertura</p>
                <p className="text-2xl font-bold text-blue-700">{diasMaximo.toFixed(1)}</p>
                <p className="text-sm text-blue-600">días</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-green-200">
                <p className="text-xs text-gray-600 mb-1">Pedido Óptimo</p>
                <p className="text-2xl font-bold text-green-700">{cantidadPedidoBultos.toFixed(1)}</p>
                <p className="text-sm text-green-600">bultos</p>
                <p className="text-xs text-gray-500 mt-1">(Max - ROP)</p>
              </div>
            </div>
          </div>

          {/* Conversión a Días */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-cyan-900 mb-3 flex items-center gap-2">
              <Info size={16} />
              ¿Cómo se convierte a Días?
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Los <strong>días de cobertura</strong> indican cuántos días de demanda cubre el stock máximo,
              usando la velocidad de venta P75 (percentil 75):
            </p>
            <div className="bg-white rounded-lg p-4 border border-cyan-300">
              <p className="text-center font-mono text-cyan-800 mb-3">
                <span className="font-bold">Días Max</span> = Stock Máximo (bultos) ÷ Velocidad P75 (bultos/día)
              </p>
              <div className="flex items-center justify-center gap-2 text-sm bg-cyan-50 rounded p-3">
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">Max (bultos)</p>
                  <p className="font-mono font-bold text-purple-700">{stockMaximoBultos.toFixed(2)}</p>
                </div>
                <span className="text-xl font-bold text-gray-400">÷</span>
                <div className="text-center px-3 py-2 bg-white rounded border">
                  <p className="text-xs text-gray-500">Velocidad P75</p>
                  <p className="font-mono font-bold text-blue-700">{demandaP75Bultos.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">bultos/día</p>
                </div>
                <span className="text-xl font-bold text-gray-400">=</span>
                <div className="text-center px-3 py-2 bg-cyan-100 rounded border-2 border-cyan-400">
                  <p className="text-xs text-cyan-600">Días Max</p>
                  <p className="font-mono font-bold text-cyan-700 text-lg">{diasMaximo.toFixed(1)}</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 italic">
              * Velocidad P75 = Demanda diaria en percentil 75 (días de venta alta).
              Usando P75 obtenemos una medida conservadora de cobertura.
            </p>
          </div>

          {/* Explicación de la Fórmula */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-purple-600" size={20} />
              <h3 className="text-lg font-semibold text-gray-900">Fórmula del Stock Máximo</h3>
            </div>

            {/* Fórmula Principal */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-purple-900 mb-3">Fórmula:</p>
              <div className="bg-white rounded-lg p-4 border border-purple-300 text-center">
                <p className="text-2xl font-mono font-bold text-purple-800">
                  Max = ROP + (D<sub>P75</sub> × Días Cobertura)
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Stock Máximo = Punto Reorden + (Demanda P75 × Días de Cobertura según clase)
                </p>
              </div>
            </div>

            {/* Cálculo Paso a Paso */}
            <div className="space-y-3">
              <h4 className="text-md font-semibold text-gray-900">Cálculo Paso a Paso:</h4>

              {/* Paso 1: ROP */}
              <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
                <p className="text-sm font-semibold text-gray-900 mb-2">Paso 1: Punto de Reorden (ROP)</p>
                <p className="text-sm text-gray-600 mb-2">
                  El ROP ya fue calculado e incluye el stock de seguridad.
                </p>
                <div className="bg-white rounded p-3 border border-orange-200">
                  <div className="flex justify-between">
                    <span>ROP:</span>
                    <span className="font-mono font-bold text-orange-700">{ropUnid.toFixed(0)} unidades</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>En bultos:</span>
                    <span className="font-mono">{ropBultos.toFixed(2)} bultos</span>
                  </div>
                </div>
              </div>

              {/* Paso 2: Días de Cobertura */}
              <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
                <p className="text-sm font-semibold text-gray-900 mb-2">Paso 2: Días de Cobertura (según Clase ABC)</p>
                <p className="text-sm text-gray-600 mb-2">
                  La clase determina cuántos días de demanda adicional debemos cubrir.
                </p>
                <div className="bg-white rounded p-3 border border-blue-200">
                  <div className="flex justify-between">
                    <span>Clase {claseEfectiva}:</span>
                    <span className="font-mono font-bold text-blue-700">{params.diasCobertura} días</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>Descripción:</span>
                    <span>{params.descripcion}</span>
                  </div>
                </div>
              </div>

              {/* Paso 3: Demanda del Ciclo */}
              <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
                <p className="text-sm font-semibold text-gray-900 mb-2">Paso 3: Demanda del Ciclo de Cobertura</p>
                <div className="bg-white rounded p-3 border border-green-200 font-mono text-sm">
                  <p>Demanda Ciclo = D<sub>P75</sub> × Días Cobertura</p>
                  <p className="mt-1">= {demandaP75.toFixed(2)} × {params.diasCobertura}</p>
                  <p className="text-green-700 font-bold mt-1">= {demandaCiclo.toFixed(0)} unidades</p>
                </div>
              </div>

              {/* Paso 4: Resultado */}
              <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
                <p className="text-sm font-semibold text-gray-900 mb-2">Paso 4: Cálculo Final</p>
                <div className="bg-white rounded p-3 border border-purple-200 font-mono text-sm">
                  <p>Stock Máximo = ROP + Demanda Ciclo</p>
                  <p className="mt-1">= {ropUnid.toFixed(0)} + {demandaCiclo.toFixed(0)}</p>
                  <p className="text-xl font-bold text-purple-700 mt-2 pt-2 border-t border-purple-200">
                    = {stockMaximoUnid.toFixed(0)} unidades
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    = {stockMaximoBultos.toFixed(1)} bultos = {diasMaximo.toFixed(1)} días de cobertura
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Días por Clase */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">
              <Info className="inline w-4 h-4 mr-1" />
              Días de Cobertura por Clase ABC
            </p>
            <div className="overflow-hidden border border-gray-200 rounded-lg bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Clase</th>
                    <th className="px-3 py-2 text-center">Días Cobertura</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className={claseEfectiva === 'A' ? 'bg-red-50 font-semibold' : ''}>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold">A</span></td>
                    <td className="px-3 py-2 text-center font-mono font-bold">7 días</td>
                    <td className="px-3 py-2 text-gray-600">Alta rotación - reposición semanal</td>
                  </tr>
                  <tr className={claseEfectiva === 'B' ? 'bg-yellow-50 font-semibold' : ''}>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">B</span></td>
                    <td className="px-3 py-2 text-center font-mono font-bold">14 días</td>
                    <td className="px-3 py-2 text-gray-600">Rotación media - reposición quincenal</td>
                  </tr>
                  <tr className={claseEfectiva === 'C' ? 'bg-gray-100 font-semibold' : ''}>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-xs font-bold">C</span></td>
                    <td className="px-3 py-2 text-center font-mono font-bold">30 días</td>
                    <td className="px-3 py-2 text-gray-600">Baja rotación - reposición mensual</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Generador de Tráfico */}
          {producto.es_generador_trafico && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="text-purple-600" size={20} />
                <h4 className="font-semibold text-purple-900">Producto Generador de Tráfico</h4>
              </div>
              <p className="text-sm text-gray-700">
                Este producto fue identificado como <strong>Generador de Tráfico</strong>:
                vende poco en $ pero aparece en muchos tickets. Por esto, <strong>se trata como Clase A</strong>
                con cobertura de 7 días, asegurando disponibilidad constante.
              </p>
            </div>
          )}

          {/* Nota sobre Cantidad a Pedir */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 mb-2">
              <Info className="inline w-4 h-4 mr-1" />
              Cantidad Óptima a Pedir
            </h4>
            <p className="text-sm text-gray-700">
              Cuando el stock actual llega al ROP, la cantidad óptima a pedir es:
            </p>
            <div className="mt-3 bg-white rounded p-3 border border-green-200">
              <p className="font-mono text-center text-green-800">
                <span className="font-bold">Cantidad</span> = Stock Máximo - ROP
              </p>
              <p className="text-center text-sm text-gray-600 mt-2">
                = {stockMaximoUnid.toFixed(0)} - {ropUnid.toFixed(0)} = <span className="font-bold text-green-700">{cantidadPedidoOptimo.toFixed(0)} unidades</span>
                {' '}({cantidadPedidoBultos.toFixed(1)} bultos)
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
