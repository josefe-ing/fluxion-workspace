/**
 * Modal para mostrar detalles de la clasificacion ABC por Valor (Pareto)
 *
 * Esta clasificacion se usa en todo el sistema (incluyendo Pedidos Sugeridos)
 * para determinar la importancia de cada producto segun su contribucion al valor
 * total de ventas, calculada especificamente para cada tienda.
 *
 * Metodologia Pareto:
 * - A: Productos que acumulan el 80% del valor de ventas
 * - B: Productos que acumulan el siguiente 15% del valor (80-95%)
 * - C: Productos que acumulan el ultimo 5% del valor (95-100%)
 */

import { X, TrendingUp, Info, DollarSign } from 'lucide-react';

interface ABCComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    abc?: string; // Clasificacion ABC por valor (A, B, C)
    velocidad_bultos_dia?: number; // Velocidad en bultos/dia (P75 de 20D)
  };
  ubicacionId?: string;
}

export default function ABCComparisonModal({
  isOpen,
  onClose,
  producto,
}: ABCComparisonModalProps) {
  if (!isOpen) return null;

  const getABCColor = (abc: string | undefined) => {
    switch (abc) {
      case 'A':
        return 'text-red-700 bg-red-50 border-red-300';
      case 'B':
        return 'text-yellow-700 bg-yellow-50 border-yellow-300';
      case 'C':
        return 'text-gray-700 bg-gray-50 border-gray-300';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-300';
    }
  };

  const getABCDescription = (abc: string | undefined) => {
    switch (abc) {
      case 'A':
        return {
          title: 'Alto Valor',
          porcentajeValor: '80% del valor',
          items: [
            'Productos estrategicos que generan la mayor parte del ingreso',
            'Prioridad maxima en disponibilidad',
            'Monitoreo constante de stock',
            'Evitar quiebres a toda costa',
          ],
          recommendation:
            'Mantener disponibilidad optima. Estos productos son criticos para el negocio.',
        };
      case 'B':
        return {
          title: 'Valor Medio',
          porcentajeValor: '15% del valor',
          items: [
            'Productos con contribucion moderada al valor',
            'Balance entre disponibilidad y costo de inventario',
            'Reposicion programada regular',
            'Monitoreo semanal recomendado',
          ],
          recommendation:
            'Mantener niveles de stock adecuados. Revisar tendencias mensualmente.',
        };
      case 'C':
        return {
          title: 'Bajo Valor',
          porcentajeValor: '5% del valor',
          items: [
            'Productos con baja contribucion al valor total',
            'Optimizar capital de trabajo',
            'Considerar reducir niveles de stock',
            'Evaluar si justifican espacio en inventario',
          ],
          recommendation:
            'Minimizar inversion en inventario. Considerar reposicion bajo demanda.',
        };
      default:
        return {
          title: 'Sin Clasificacion',
          porcentajeValor: 'N/A',
          items: ['Sin datos de venta en los ultimos 30 dias', 'No aplica clasificacion'],
          recommendation: 'Se requieren datos de venta para clasificar este producto.',
        };
    }
  };

  const abcInfo = getABCDescription(producto.abc);
  const velocidad = producto.velocidad_bultos_dia || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Clasificacion ABC</h2>
            <p className="text-sm text-gray-600 mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Clasificacion Principal */}
          <div className={`rounded-lg p-6 border-2 ${getABCColor(producto.abc)}`}>
            <div className="flex items-center gap-4 mb-4">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold ${getABCColor(producto.abc)}`}
              >
                {producto.abc || '?'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{abcInfo.title}</h3>
                <p className="text-sm text-gray-600">Contribuye al {abcInfo.porcentajeValor}</p>
              </div>
            </div>

            {/* Metrica de Velocidad (informativa) */}
            <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <p className="text-xs text-blue-600 uppercase font-semibold">
                  Velocidad de Venta (P75 de 20D)
                </p>
              </div>
              <p className="text-2xl font-bold text-blue-700">
                {velocidad > 0 ? `${velocidad.toFixed(2)} bultos/dia` : 'N/A'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Usado para calculos de stock (minimo, seguridad, reorden)
              </p>
            </div>

            {/* Caracteristicas */}
            <div className="space-y-2 mb-4">
              <p className="text-xs text-gray-600 uppercase">Caracteristicas</p>
              <ul className="space-y-1.5">
                {abcInfo.items.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-green-600 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Recomendacion */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-600 uppercase mb-1">Recomendacion</p>
              <p className="text-sm text-gray-700">{abcInfo.recommendation}</p>
            </div>
          </div>

          {/* Nota informativa sobre el calculo */}
          <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Como se calcula la clasificacion ABC
            </h4>
            <div className="space-y-2 text-sm text-gray-700">
              <p>
                La clasificacion ABC se basa en el <strong>principio de Pareto</strong> aplicado
                al <strong>valor de ventas</strong> de los ultimos 30 dias en esta tienda.
              </p>
              <p>
                Los productos se ordenan por valor de venta y se clasifican segun su contribucion
                al total acumulado.
              </p>
            </div>
          </div>

          {/* Umbrales de clasificacion */}
          <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Metodologia Pareto 80/15/5
            </h4>
            <div className="text-sm text-gray-700 space-y-2">
              <p>Los productos se clasifican por su contribucion al valor total de ventas:</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-red-50 rounded p-3 text-center border border-red-200">
                  <p className="font-bold text-red-700 text-xl">A</p>
                  <p className="text-xs text-red-600 font-medium">80% del valor</p>
                  <p className="text-xs text-gray-500 mt-1">Pocos productos, alto impacto</p>
                </div>
                <div className="bg-yellow-50 rounded p-3 text-center border border-yellow-200">
                  <p className="font-bold text-yellow-700 text-xl">B</p>
                  <p className="text-xs text-yellow-600 font-medium">15% del valor</p>
                  <p className="text-xs text-gray-500 mt-1">Productos intermedios</p>
                </div>
                <div className="bg-gray-50 rounded p-3 text-center border border-gray-300">
                  <p className="font-bold text-gray-700 text-xl">C</p>
                  <p className="text-xs text-gray-600 font-medium">5% del valor</p>
                  <p className="text-xs text-gray-500 mt-1">Muchos productos, bajo impacto</p>
                </div>
              </div>
            </div>
          </div>

          {/* P75 para calculos de stock */}
          <div className="mt-4 bg-green-50 rounded-lg p-4 border border-green-200">
            <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Calculos de Stock con P75
            </h4>
            <p className="text-sm text-green-700">
              Los niveles de stock (minimo, seguridad, reorden) se calculan usando el
              <strong> Percentil 75</strong> de las ventas diarias. Esto asegura que el stock
              cubra adecuadamente los dias de mayor demanda, no solo el promedio.
            </p>
          </div>

          {/* Consistencia del modelo */}
          <div className="mt-4 bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h4 className="font-semibold text-purple-800 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Consistencia del Sistema
            </h4>
            <p className="text-sm text-purple-700">
              Esta clasificacion ABC por valor es la misma que se usa en
              <strong> Productos → ABC-XYZ</strong>. El sistema usa un unico modelo de
              clasificacion ABC en todas las vistas para mantener consistencia.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
