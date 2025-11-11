/**
 * Modal detallado para visualización de clasificación XYZ
 * Muestra variabilidad de demanda, matriz ABC-XYZ y estrategias recomendadas
 */

import { X } from 'lucide-react';
import {
  ClasificacionABCv2,
  getDescripcionXYZ,
  getEstrategiaMatriz,
} from '../../services/abcV2Service';

interface XYZModalProps {
  isOpen: boolean;
  onClose: () => void;
  clasificacion: ClasificacionABCv2 | null;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
  };
}

export default function XYZModal({
  isOpen,
  onClose,
  clasificacion,
  producto,
}: XYZModalProps) {
  if (!isOpen) return null;

  // Si no hay clasificación XYZ, mostrar mensaje
  if (!clasificacion?.clasificacion_xyz) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">XYZ - Variabilidad de Demanda</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="p-6 text-center">
            <div className="text-gray-400 text-6xl mb-4">📊</div>
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Sin clasificación XYZ disponible
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
            <p className="text-sm text-gray-500">
              Este producto no tiene suficientes datos de ventas semanales para calcular
              su variabilidad de demanda.
            </p>
          </div>

          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const xyz = clasificacion.clasificacion_xyz;
  const matriz = clasificacion.matriz_abc_xyz || '';
  const cv = clasificacion.coeficiente_variacion || 0;
  const demandaSemanal = clasificacion.demanda_promedio_semanal || 0;
  const desviacion = clasificacion.desviacion_estandar_semanal || 0;
  const semanasConVenta = clasificacion.semanas_con_venta || 0;
  const semanasAnalizadas = 12; // Por defecto
  const confiabilidad = clasificacion.confiabilidad_calculo || 'N/A';
  const esVolatil = clasificacion.es_extremadamente_volatil || false;

  // Determinar color de fondo según clasificación
  const getBgColor = () => {
    if (xyz === 'X') return 'from-green-600 to-green-700';
    if (xyz === 'Y') return 'from-yellow-600 to-yellow-700';
    if (xyz === 'Z') return 'from-red-600 to-red-700';
    return 'from-gray-600 to-gray-700';
  };

  const getColorClase = () => {
    if (xyz === 'X') return 'text-green-700 bg-green-50 border-green-300';
    if (xyz === 'Y') return 'text-yellow-700 bg-yellow-50 border-yellow-300';
    if (xyz === 'Z') return 'text-red-700 bg-red-50 border-red-300';
    return 'text-gray-700 bg-gray-50 border-gray-300';
  };

  // Determinar color de matriz
  const getMatrizColor = () => {
    if (matriz === 'AZ') return 'text-red-900 bg-red-100 border-red-400';
    if (matriz === 'AX') return 'text-green-800 bg-green-100 border-green-400';
    if (matriz?.startsWith('A')) return 'text-red-700 bg-red-50 border-red-300';
    if (matriz?.startsWith('B')) return 'text-yellow-700 bg-yellow-50 border-yellow-300';
    if (matriz?.startsWith('C')) return 'text-gray-700 bg-gray-50 border-gray-300';
    return 'text-gray-500 bg-gray-50 border-gray-300';
  };

  // Nivel de confiabilidad con colores
  const getConfiabilidadColor = () => {
    if (confiabilidad === 'ALTA') return 'text-green-700 bg-green-100';
    if (confiabilidad === 'MEDIA') return 'text-yellow-700 bg-yellow-100';
    if (confiabilidad === 'BAJA') return 'text-orange-700 bg-orange-100';
    return 'text-gray-700 bg-gray-100';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className={`sticky top-0 bg-gradient-to-r ${getBgColor()} text-white px-6 py-4 flex items-center justify-between`}>
          <div>
            <h2 className="text-xl font-bold">XYZ - Análisis de Variabilidad 📊</h2>
            <p className="text-sm text-white text-opacity-90 mt-1">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
          {/* Clasificación Principal */}
          <div className="grid grid-cols-2 gap-6">
            {/* Clasificación XYZ */}
            <div className={`border-2 rounded-lg p-6 ${getColorClase()}`}>
              <p className="text-xs font-semibold uppercase mb-2 opacity-70">
                Clasificación XYZ
              </p>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-6xl font-bold">
                  {xyz}
                  {esVolatil && <span className="text-4xl ml-2">⚡</span>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {getDescripcionXYZ(xyz)}
                  </p>
                  {esVolatil && (
                    <p className="text-xs mt-1 font-semibold">
                      ⚠️ Extremadamente volátil (CV {'>'} 2.0)
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-current border-opacity-20">
                <p className="text-xs font-semibold mb-2">¿Qué significa?</p>
                <ul className="text-xs space-y-1">
                  {xyz === 'X' && (
                    <>
                      <li>• Demanda muy predecible</li>
                      <li>• Fácil de planificar</li>
                      <li>• Bajo riesgo de exceso o quiebre</li>
                    </>
                  )}
                  {xyz === 'Y' && (
                    <>
                      <li>• Demanda con tendencias</li>
                      <li>• Requiere seguimiento regular</li>
                      <li>• Riesgo moderado</li>
                    </>
                  )}
                  {xyz === 'Z' && (
                    <>
                      <li>• Demanda muy impredecible</li>
                      <li>• Difícil de planificar</li>
                      <li>• Alto riesgo de error</li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            {/* Matriz ABC-XYZ */}
            <div className={`border-2 rounded-lg p-6 ${getMatrizColor()}`}>
              <p className="text-xs font-semibold uppercase mb-2 opacity-70">
                Matriz Combinada
              </p>
              <div className="text-6xl font-bold mb-4">
                {matriz}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold uppercase mb-1">
                    Estrategia Recomendada
                  </p>
                  <p className="text-sm font-medium">
                    {getEstrategiaMatriz(matriz)}
                  </p>
                </div>

                <div className="pt-2 border-t border-current border-opacity-20">
                  <p className="text-xs font-semibold mb-1">Interpretación</p>
                  <p className="text-xs">
                    <strong>{clasificacion.clasificacion_abc_valor}</strong> (valor) +{' '}
                    <strong>{xyz}</strong> (variabilidad)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Métricas Detalladas */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              📈 Métricas de Variabilidad
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-600 uppercase mb-1">
                  Coeficiente de Variación
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {cv.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  σ / μ
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-600 uppercase mb-1">
                  Demanda Promedio
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {demandaSemanal.toFixed(1)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  unidades/semana
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-600 uppercase mb-1">
                  Desviación Estándar
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {desviacion.toFixed(1)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  unidades
                </p>
              </div>

              <div className={`rounded-lg p-4 border ${getConfiabilidadColor()}`}>
                <p className="text-xs uppercase mb-1 font-semibold">
                  Confiabilidad
                </p>
                <p className="text-2xl font-bold">
                  {confiabilidad}
                </p>
                <p className="text-xs mt-1">
                  {semanasConVenta}/{semanasAnalizadas} semanas
                </p>
              </div>
            </div>
          </div>

          {/* Interpretación Contextual */}
          {matriz === 'AZ' && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <span className="text-3xl">🔥</span>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-red-900 mb-2">
                    PRODUCTO CRÍTICO - Requiere Atención Especial
                  </h4>
                  <p className="text-sm text-red-800 mb-3">
                    Este producto genera alto valor económico pero tiene demanda muy
                    impredecible. Es fundamental implementar controles especiales.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-red-200">
                    <p className="text-sm font-semibold text-red-900 mb-2">
                      🚨 Acciones Recomendadas:
                    </p>
                    <ul className="text-sm text-red-800 space-y-2">
                      <li>
                        • <strong>Monitoreo diario:</strong> Revisar stock y demanda todos
                        los días
                      </li>
                      <li>
                        • <strong>Stock de seguridad alto:</strong> Aumentar buffer para
                        absorber variabilidad
                      </li>
                      <li>
                        • <strong>Alertas automáticas:</strong> Configurar notificaciones de
                        punto de reorden
                      </li>
                      <li>
                        • <strong>Análisis de causas:</strong> Investigar por qué la demanda
                        es tan errática
                      </li>
                      <li>
                        • <strong>Comunicación con proveedores:</strong> Asegurar
                        disponibilidad rápida
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {matriz === 'AX' && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <span className="text-3xl">✓</span>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-green-900 mb-2">
                    PRODUCTO IDEAL - Fácil de Gestionar
                  </h4>
                  <p className="text-sm text-green-800 mb-3">
                    Este producto genera alto valor y tiene demanda predecible. Es el tipo
                    de producto más fácil de gestionar.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <p className="text-sm font-semibold text-green-900 mb-2">
                      ✅ Estrategia Óptima:
                    </p>
                    <ul className="text-sm text-green-800 space-y-2">
                      <li>
                        • <strong>Stock alto:</strong> Mantener disponibilidad constante
                      </li>
                      <li>
                        • <strong>Reposición automática:</strong> Configurar puntos de
                        reorden fijos
                      </li>
                      <li>
                        • <strong>Prioridad máxima:</strong> Nunca debe faltar en tienda
                      </li>
                      <li>
                        • <strong>Revisión semanal:</strong> Monitoreo de rutina es
                        suficiente
                      </li>
                      <li>
                        • <strong>Bajo riesgo:</strong> Demanda estable = inventario
                        predecible
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {matriz === 'CZ' && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <span className="text-3xl">⚠️</span>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-orange-900 mb-2">
                    CANDIDATO A DESCONTINUACIÓN
                  </h4>
                  <p className="text-sm text-orange-800 mb-3">
                    Bajo valor económico + demanda errática = difícil de justificar
                    inventario.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-orange-200">
                    <p className="text-sm font-semibold text-orange-900 mb-2">
                      🤔 Evaluar:
                    </p>
                    <ul className="text-sm text-orange-800 space-y-2">
                      <li>• ¿Es realmente necesario mantener este producto?</li>
                      <li>• ¿Hay alternativa con mejor rotación?</li>
                      <li>• ¿Se puede manejar solo bajo pedido?</li>
                      <li>
                        • <strong>Recomendación:</strong> Stock mínimo o descontinuar
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Escala Visual de CV */}
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              📏 Escala de Coeficiente de Variación
            </h3>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-20 text-sm font-semibold text-gray-700">CV {'<'} 0.5</div>
                <div className="flex-1 h-8 bg-gradient-to-r from-green-200 to-green-400 rounded flex items-center px-3 text-sm font-medium text-green-900">
                  X - Muy Predecible
                </div>
                {cv < 0.5 && <span className="text-2xl">👈</span>}
              </div>

              <div className="flex items-center gap-3">
                <div className="w-20 text-sm font-semibold text-gray-700">
                  0.5 ≤ CV {'<'} 1.0
                </div>
                <div className="flex-1 h-8 bg-gradient-to-r from-yellow-200 to-yellow-400 rounded flex items-center px-3 text-sm font-medium text-yellow-900">
                  Y - Variable
                </div>
                {cv >= 0.5 && cv < 1.0 && <span className="text-2xl">👈</span>}
              </div>

              <div className="flex items-center gap-3">
                <div className="w-20 text-sm font-semibold text-gray-700">CV ≥ 1.0</div>
                <div className="flex-1 h-8 bg-gradient-to-r from-red-200 to-red-400 rounded flex items-center px-3 text-sm font-medium text-red-900">
                  Z - Muy Errático
                </div>
                {cv >= 1.0 && <span className="text-2xl">👈</span>}
              </div>

              <div className="pt-3 border-t border-blue-200">
                <p className="text-xs text-gray-600">
                  <strong>Tu producto:</strong> CV = {cv.toFixed(2)} → Clasificación{' '}
                  <strong className="text-blue-700">{xyz}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Confiabilidad del Cálculo */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              🎯 Confiabilidad del Análisis
            </h3>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div
                className={`p-3 rounded-lg border-2 ${
                  confiabilidad === 'ALTA'
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <p className="text-xs font-semibold text-gray-700 mb-1">ALTA</p>
                <p className="text-xs text-gray-600">≥ 8 semanas con venta</p>
              </div>
              <div
                className={`p-3 rounded-lg border-2 ${
                  confiabilidad === 'MEDIA'
                    ? 'border-yellow-400 bg-yellow-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <p className="text-xs font-semibold text-gray-700 mb-1">MEDIA</p>
                <p className="text-xs text-gray-600">4-7 semanas con venta</p>
              </div>
              <div
                className={`p-3 rounded-lg border-2 ${
                  confiabilidad === 'BAJA'
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <p className="text-xs font-semibold text-gray-700 mb-1">BAJA</p>
                <p className="text-xs text-gray-600">{'<'} 4 semanas con venta</p>
              </div>
            </div>

            <p className="text-sm text-gray-700">
              Este producto tuvo ventas en <strong>{semanasConVenta}</strong> de las últimas{' '}
              <strong>{semanasAnalizadas}</strong> semanas →{' '}
              <strong className="text-blue-700">Confiabilidad {confiabilidad}</strong>
            </p>

            {confiabilidad === 'BAJA' && (
              <p className="text-xs text-orange-700 mt-2">
                ⚠️ Datos insuficientes para clasificación confiable. Monitorear más tiempo.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
