import { X } from 'lucide-react';

interface ABCClassificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
    prom_ventas_20dias_unid: number;
    cantidad_bultos: number;
  };
}

// Configuración de umbrales de clasificación ABC
const ABC_THRESHOLDS = {
  A: 20,
  AB: 5,
  B: 0.45,
  BC: 0.20,
  C: 0.001,
} as const;

export default function ABCClassificationModal({ isOpen, onClose, producto }: ABCClassificationModalProps) {
  if (!isOpen) return null;

  const promVentaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  const ventaDiariaBultos = promVentaDiariaBultos;

  // Calcular clasificación usando la misma lógica que en la tabla
  let clasificacion: string;
  let proximoUmbral: number | null = null;
  let clasificacionSuperior: string | null = null;

  if (ventaDiariaBultos >= ABC_THRESHOLDS.A) {
    clasificacion = 'A';
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.AB) {
    clasificacion = 'AB';
    proximoUmbral = ABC_THRESHOLDS.A;
    clasificacionSuperior = 'A';
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.B) {
    clasificacion = 'B';
    proximoUmbral = ABC_THRESHOLDS.AB;
    clasificacionSuperior = 'AB';
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.BC) {
    clasificacion = 'BC';
    proximoUmbral = ABC_THRESHOLDS.B;
    clasificacionSuperior = 'B';
  } else if (ventaDiariaBultos >= ABC_THRESHOLDS.C) {
    clasificacion = 'C';
    proximoUmbral = ABC_THRESHOLDS.BC;
    clasificacionSuperior = 'BC';
  } else {
    clasificacion = '-';
    proximoUmbral = ABC_THRESHOLDS.C;
    clasificacionSuperior = 'C';
  }

  const diferenciaSiguienteNivel = proximoUmbral ? proximoUmbral - ventaDiariaBultos : 0;
  const porcentajeHaciaProximo = proximoUmbral
    ? ((ventaDiariaBultos / proximoUmbral) * 100).toFixed(1)
    : '100.0';

  const getColorClasificacion = (clase: string) => {
    if (clase === 'A') return 'text-red-700 bg-red-50';
    if (clase === 'AB') return 'text-orange-700 bg-orange-50';
    if (clase === 'B') return 'text-yellow-700 bg-yellow-50';
    if (clase === 'BC') return 'text-amber-700 bg-amber-50';
    if (clase === 'C') return 'text-gray-700 bg-gray-50';
    return 'text-gray-500 bg-gray-50';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Clasificación ABC: {clasificacion}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
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

          {/* Cálculo Principal */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Cálculo de Clasificación</h3>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Promedio Venta 20 Días (bultos)</p>
                  <p className="text-lg font-bold text-purple-700">{promVentaDiariaBultos.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Unidades por Bulto</p>
                  <p className="text-lg font-bold text-blue-700">{producto.cantidad_bultos.toFixed(0)}</p>
                </div>
              </div>

              <div className="border-t border-gray-300 pt-3">
                <p className="text-xs text-gray-600 mb-1">Cálculo Base</p>
                <p className="text-sm text-gray-700 font-mono mb-2">
                  {producto.prom_ventas_20dias_unid.toFixed(2)} unid ÷ {producto.cantidad_bultos.toFixed(0)} unid/bulto
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {ventaDiariaBultos.toFixed(3)} bultos/día
                </p>
              </div>
            </div>
          </div>

          {/* Umbrales de Clasificación */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Umbrales de Clasificación</h3>

            <div className="space-y-2">
              {Object.entries(ABC_THRESHOLDS).map(([clase, umbral]) => {
                const isClaseActual = clase === clasificacion;
                const isReached = ventaDiariaBultos >= umbral;

                return (
                  <div
                    key={clase}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      isClaseActual
                        ? `${getColorClasificacion(clase)} border-current font-bold`
                        : isReached
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold px-2 py-1 rounded ${getColorClasificacion(clase)}`}>
                        {clase}
                      </span>
                      <span className="text-sm text-gray-700">
                        ≥ {umbral} bultos/día
                      </span>
                    </div>
                    <div>
                      {isClaseActual && (
                        <span className="text-sm font-bold text-green-700">
                          ✓ CLASIFICACIÓN ACTUAL
                        </span>
                      )}
                      {isReached && !isClaseActual && (
                        <span className="text-sm text-green-600">✓ Alcanzado</span>
                      )}
                      {!isReached && (
                        <span className="text-sm text-gray-400">No alcanzado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distancia al Siguiente Nivel */}
          {proximoUmbral && clasificacionSuperior && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-3">
                Progreso hacia {clasificacionSuperior}
              </h3>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Actual: {ventaDiariaBultos.toFixed(3)} bultos/día</span>
                  <span className="text-gray-700">Objetivo: {proximoUmbral} bultos/día</span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-orange-500 h-full transition-all duration-500"
                    style={{ width: `${Math.min(parseFloat(porcentajeHaciaProximo), 100)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-gray-600">
                  <span>{porcentajeHaciaProximo}% del objetivo</span>
                  <span className="font-bold text-orange-700">
                    Faltan {diferenciaSiguienteNivel.toFixed(3)} bultos/día
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Explicación de la Métrica */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              ¿Cómo se calcula la clasificación?
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              La clasificación ABC se basa en la <strong>velocidad de venta en bultos por día</strong>,
              calculada dividiendo el promedio de ventas de los últimos 20 días (en unidades)
              entre las unidades por bulto del producto. Los productos de clase <strong>A</strong> son
              los de mayor rotación, mientras que los de clase <strong>C</strong> tienen menor rotación.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
