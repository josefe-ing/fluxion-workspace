import { X, TrendingUp, Info, Calculator, Target, Shield, Package } from 'lucide-react';
import { useState } from 'react';
import MatrizABCXYZBadge from '../shared/MatrizABCXYZBadge';
import {
  formatearNumero,
  obtenerNivelServicio,
  calcularDiasStock,
  obtenerClaseEstadoStock
} from '../../services/nivelObjetivoService';
import type { CantidadSugeridaData } from '../../services/nivelObjetivoService';

interface NivelObjetivoDetalleModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    codigo_producto: string;
    descripcion_producto: string;
  };
  datos: CantidadSugeridaData;
}

export default function NivelObjetivoDetalleModal({
  isOpen,
  onClose,
  producto,
  datos
}: NivelObjetivoDetalleModalProps) {
  const [seccionExpandida, setSeccionExpandida] = useState<string | null>(null);

  if (!isOpen) return null;

  // Cálculos derivados
  const {
    matriz_abc_xyz,
    demanda_promedio_diaria,
    desviacion_estandar_diaria,
    demanda_ciclo,
    stock_seguridad,
    nivel_objetivo,
    stock_actual,
    inventario_en_transito,
    cantidad_sugerida,
    datos_calculo
  } = datos;

  const diasStock = calcularDiasStock(stock_actual, inventario_en_transito, demanda_promedio_diaria);
  const claseEstadoStock = obtenerClaseEstadoStock(diasStock, matriz_abc_xyz);
  const nivelServicio = obtenerNivelServicio(datos_calculo.nivel_servicio_z);
  const coeficienteVariacion = demanda_promedio_diaria > 0
    ? desviacion_estandar_diaria / demanda_promedio_diaria
    : 0;

  const toggleSeccion = (seccion: string) => {
    setSeccionExpandida(seccionExpandida === seccion ? null : seccion);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg z-10">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Target className="h-6 w-6" />
              <h2 className="text-2xl font-bold">
                Nivel Objetivo: {formatearNumero(nivel_objetivo)} unidades
              </h2>
            </div>
            <p className="text-sm text-indigo-100">
              {producto.codigo_producto} - {producto.descripcion_producto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-white hover:text-indigo-100 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Resumen Visual Grande */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Nivel Objetivo */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-6 border-2 border-indigo-300">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-indigo-600" />
                <p className="text-sm font-medium text-indigo-900">Nivel Objetivo</p>
              </div>
              <p className="text-4xl font-bold text-indigo-700">
                {formatearNumero(nivel_objetivo)}
              </p>
              <p className="text-xs text-indigo-600 mt-1">unidades</p>
            </div>

            {/* Stock Actual */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-300">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-5 w-5 text-blue-600" />
                <p className="text-sm font-medium text-blue-900">Stock Actual + Tránsito</p>
              </div>
              <p className="text-4xl font-bold text-blue-700">
                {formatearNumero(stock_actual + inventario_en_transito)}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {formatearNumero(stock_actual)} en tienda + {formatearNumero(inventario_en_transito)} en tránsito
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${claseEstadoStock}`}></div>
                <span className="text-xs text-gray-700">
                  {diasStock === Infinity ? '∞' : diasStock.toFixed(1)} días de stock
                </span>
              </div>
            </div>

            {/* Cantidad Sugerida */}
            <div className={`bg-gradient-to-br rounded-xl p-6 border-2 ${
              cantidad_sugerida > 0
                ? 'from-green-50 to-green-100 border-green-300'
                : 'from-gray-50 to-gray-100 border-gray-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className={`h-5 w-5 ${cantidad_sugerida > 0 ? 'text-green-600' : 'text-gray-600'}`} />
                <p className={`text-sm font-medium ${cantidad_sugerida > 0 ? 'text-green-900' : 'text-gray-900'}`}>
                  Cantidad Sugerida
                </p>
              </div>
              <p className={`text-4xl font-bold ${cantidad_sugerida > 0 ? 'text-green-700' : 'text-gray-700'}`}>
                {formatearNumero(cantidad_sugerida)}
              </p>
              <p className={`text-xs mt-1 ${cantidad_sugerida > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                {cantidad_sugerida > 0 ? 'SÍ PEDIR' : 'NO PEDIR'}
              </p>
            </div>
          </div>

          {/* Clasificación ABC-XYZ */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-5 border-2 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-900 mb-2">Clasificación</p>
                <MatrizABCXYZBadge matriz={matriz_abc_xyz} size="lg" mostrarPrioridad mostrarTooltip={false} />
              </div>
              <div className="text-right">
                <p className="text-xs text-purple-700">Nivel de Servicio</p>
                <p className="text-2xl font-bold text-purple-800">{nivelServicio}</p>
              </div>
            </div>
          </div>

          {/* Paso 1: Demanda Histórica */}
          <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSeccion('demanda')}
              className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  1
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Análisis de Demanda Histórica</p>
                  <p className="text-sm text-gray-600">Últimas 8 semanas de ventas</p>
                </div>
              </div>
              <div className="text-gray-400">
                {seccionExpandida === 'demanda' ? '▼' : '▶'}
              </div>
            </button>

            {seccionExpandida === 'demanda' && (
              <div className="p-5 space-y-4 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded p-3 border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium">Demanda Promedio Diaria</p>
                    <p className="text-2xl font-bold text-blue-800">{formatearNumero(demanda_promedio_diaria, 2)}</p>
                    <p className="text-xs text-blue-600 mt-1">unidades/día</p>
                  </div>
                  <div className="bg-blue-50 rounded p-3 border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium">Desviación Estándar</p>
                    <p className="text-2xl font-bold text-blue-800">{formatearNumero(desviacion_estandar_diaria, 2)}</p>
                    <p className="text-xs text-blue-600 mt-1">unidades/día</p>
                  </div>
                  <div className="bg-blue-50 rounded p-3 border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium">Coeficiente de Variación</p>
                    <p className="text-2xl font-bold text-blue-800">{coeficienteVariacion.toFixed(3)}</p>
                    <p className="text-xs text-blue-600 mt-1">
                      {coeficienteVariacion < 0.5 ? 'Estable (X)' :
                       coeficienteVariacion < 1.0 ? 'Variable (Y)' : 'Errática (Z)'}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded p-3 border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium">Periodo Analizado</p>
                    <p className="text-2xl font-bold text-blue-800">8</p>
                    <p className="text-xs text-blue-600 mt-1">semanas</p>
                  </div>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-600 p-3 rounded">
                  <p className="text-xs text-blue-900">
                    <Info className="inline h-4 w-4 mr-1" />
                    <strong>¿Cómo se calcula?</strong> El sistema analiza las ventas diarias de las últimas 8 semanas
                    para calcular el promedio y la variabilidad. Esto permite identificar patrones de demanda y
                    clasificar el producto según su comportamiento.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Paso 2: Demanda Durante el Ciclo */}
          <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSeccion('ciclo')}
              className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  2
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Demanda Durante el Ciclo de Reposición</p>
                  <p className="text-sm text-gray-600">Cuánto se vende mientras llega el pedido (2.5 días)</p>
                </div>
              </div>
              <div className="text-gray-400">
                {seccionExpandida === 'ciclo' ? '▼' : '▶'}
              </div>
            </button>

            {seccionExpandida === 'ciclo' && (
              <div className="p-5 space-y-4 bg-white">
                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-300">
                  <p className="text-sm text-green-800 font-medium mb-3">Fórmula:</p>
                  <div className="font-mono text-sm bg-white p-3 rounded border border-green-300">
                    Demanda Ciclo = Demanda Diaria × Periodo × Multiplicador
                  </div>
                  <div className="font-mono text-sm bg-white p-3 rounded border border-green-300 mt-2">
                    Demanda Ciclo = {formatearNumero(demanda_promedio_diaria, 2)} × {datos_calculo.periodo_reposicion_dias} × {datos_calculo.multiplicador_demanda}
                  </div>
                  <div className="font-mono text-lg bg-green-100 p-3 rounded border-2 border-green-400 mt-2 font-bold text-green-800">
                    Demanda Ciclo = {formatearNumero(demanda_ciclo, 2)} unidades
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">Lead Time</p>
                    <p className="text-lg font-bold text-gray-800">1.5 días</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">Review Cycle</p>
                    <p className="text-lg font-bold text-gray-800">1.0 día</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">Total</p>
                    <p className="text-lg font-bold text-gray-800">2.5 días</p>
                  </div>
                </div>

                <div className="bg-green-50 border-l-4 border-green-600 p-3 rounded">
                  <p className="text-xs text-green-900">
                    <Info className="inline h-4 w-4 mr-1" />
                    <strong>¿Por qué 2.5 días?</strong> Es el tiempo desde que haces el pedido hasta que llega a la tienda
                    (1.5 días) más el tiempo de revisión diaria (1 día). Durante estos 2.5 días, el producto se sigue vendiendo.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Paso 3: Stock de Seguridad */}
          <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSeccion('seguridad')}
              className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  3
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Stock de Seguridad</p>
                  <p className="text-sm text-gray-600">Protección contra variabilidad de la demanda</p>
                </div>
              </div>
              <div className="text-gray-400">
                {seccionExpandida === 'seguridad' ? '▼' : '▶'}
              </div>
            </button>

            {seccionExpandida === 'seguridad' && (
              <div className="p-5 space-y-4 bg-white">
                <div className="bg-orange-50 rounded-lg p-4 border-2 border-orange-300">
                  <p className="text-sm text-orange-800 font-medium mb-3">Fórmula:</p>
                  <div className="font-mono text-sm bg-white p-3 rounded border border-orange-300">
                    SS = Z-score × Desv.Std × √(Periodo) × Multiplicador SS
                  </div>
                  <div className="font-mono text-sm bg-white p-3 rounded border border-orange-300 mt-2">
                    SS = {datos_calculo.nivel_servicio_z} × {formatearNumero(desviacion_estandar_diaria, 2)} × √{datos_calculo.periodo_reposicion_dias} × {datos_calculo.multiplicador_ss}
                  </div>
                  <div className="font-mono text-sm bg-white p-3 rounded border border-orange-300 mt-2">
                    SS = {datos_calculo.nivel_servicio_z} × {formatearNumero(desviacion_estandar_diaria, 2)} × {Math.sqrt(datos_calculo.periodo_reposicion_dias).toFixed(3)} × {datos_calculo.multiplicador_ss}
                  </div>
                  <div className="font-mono text-lg bg-orange-100 p-3 rounded border-2 border-orange-400 mt-2 font-bold text-orange-800">
                    Stock Seguridad = {formatearNumero(stock_seguridad, 2)} unidades
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-orange-50 rounded p-3 border border-orange-200">
                    <p className="text-xs text-orange-700 font-medium">Z-Score</p>
                    <p className="text-2xl font-bold text-orange-800">{datos_calculo.nivel_servicio_z}</p>
                    <p className="text-xs text-orange-600 mt-1">Nivel servicio: {nivelServicio}</p>
                  </div>
                  <div className="bg-orange-50 rounded p-3 border border-orange-200">
                    <p className="text-xs text-orange-700 font-medium">Multiplicador SS</p>
                    <p className="text-2xl font-bold text-orange-800">{datos_calculo.multiplicador_ss}x</p>
                    <p className="text-xs text-orange-600 mt-1">Ajuste por clasificación {matriz_abc_xyz}</p>
                  </div>
                </div>

                <div className="bg-orange-50 border-l-4 border-orange-600 p-3 rounded">
                  <p className="text-xs text-orange-900">
                    <Shield className="inline h-4 w-4 mr-1" />
                    <strong>¿Para qué sirve?</strong> El stock de seguridad es un colchón que protege contra picos
                    inesperados de demanda. Productos clase {matriz_abc_xyz} tienen un nivel de servicio de {nivelServicio},
                    lo que significa que hay un {nivelServicio} de probabilidad de tener el producto disponible.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Paso 4: Nivel Objetivo */}
          <div className="border-2 border-indigo-300 rounded-lg overflow-hidden bg-indigo-50">
            <div className="bg-gradient-to-r from-indigo-100 to-indigo-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                  4
                </div>
                <div>
                  <p className="font-semibold text-indigo-900">Nivel Objetivo = Demanda Ciclo + Stock Seguridad</p>
                  <p className="text-sm text-indigo-700">La cantidad ideal que debe tener la tienda</p>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white">
              <div className="bg-indigo-50 rounded-lg p-4 border-2 border-indigo-300">
                <div className="font-mono text-sm bg-white p-3 rounded border border-indigo-300">
                  Nivel Objetivo = Demanda Ciclo + Stock Seguridad
                </div>
                <div className="font-mono text-sm bg-white p-3 rounded border border-indigo-300 mt-2">
                  Nivel Objetivo = {formatearNumero(demanda_ciclo, 2)} + {formatearNumero(stock_seguridad, 2)}
                </div>
                <div className="font-mono text-2xl bg-indigo-100 p-4 rounded border-2 border-indigo-400 mt-2 font-bold text-indigo-800 text-center">
                  Nivel Objetivo = {formatearNumero(nivel_objetivo, 2)} unidades
                </div>
              </div>
            </div>
          </div>

          {/* Paso 5: Cantidad Sugerida */}
          <div className={`border-2 rounded-lg overflow-hidden ${cantidad_sugerida > 0 ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className={`p-4 ${cantidad_sugerida > 0 ? 'bg-gradient-to-r from-green-100 to-green-200' : 'bg-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold ${cantidad_sugerida > 0 ? 'bg-green-600' : 'bg-gray-600'}`}>
                  5
                </div>
                <div>
                  <p className={`font-semibold ${cantidad_sugerida > 0 ? 'text-green-900' : 'text-gray-900'}`}>
                    Cantidad Sugerida = Nivel Objetivo - Stock Disponible
                  </p>
                  <p className={`text-sm ${cantidad_sugerida > 0 ? 'text-green-700' : 'text-gray-700'}`}>
                    ¿Cuánto debemos pedir?
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white">
              <div className={`rounded-lg p-4 border-2 ${cantidad_sugerida > 0 ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300'}`}>
                <div className="font-mono text-sm bg-white p-3 rounded border border-gray-300">
                  Cantidad = MAX(0, Nivel Objetivo - Stock Actual - En Tránsito)
                </div>
                <div className="font-mono text-sm bg-white p-3 rounded border border-gray-300 mt-2">
                  Cantidad = MAX(0, {formatearNumero(nivel_objetivo)} - {formatearNumero(stock_actual)} - {formatearNumero(inventario_en_transito)})
                </div>
                <div className="font-mono text-sm bg-white p-3 rounded border border-gray-300 mt-2">
                  Cantidad = MAX(0, {formatearNumero(nivel_objetivo - stock_actual - inventario_en_transito)})
                </div>
                <div className={`font-mono text-2xl p-4 rounded border-2 mt-2 font-bold text-center ${
                  cantidad_sugerida > 0
                    ? 'bg-green-100 border-green-400 text-green-800'
                    : 'bg-gray-100 border-gray-400 text-gray-800'
                }`}>
                  {cantidad_sugerida > 0 ? '✓ SÍ PEDIR' : '✗ NO PEDIR'}: {formatearNumero(cantidad_sugerida)} unidades
                </div>
              </div>

              {cantidad_sugerida > 0 ? (
                <div className="bg-green-50 border-l-4 border-green-600 p-3 rounded mt-4">
                  <p className="text-xs text-green-900">
                    <TrendingUp className="inline h-4 w-4 mr-1" />
                    <strong>Decisión: PEDIR {formatearNumero(cantidad_sugerida)} unidades</strong><br />
                    El stock actual ({formatearNumero(stock_actual + inventario_en_transito)} unidades incluyendo tránsito)
                    está por debajo del nivel objetivo. Se sugiere pedir para alcanzar el nivel óptimo.
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 border-l-4 border-gray-600 p-3 rounded mt-4">
                  <p className="text-xs text-gray-900">
                    <Package className="inline h-4 w-4 mr-1" />
                    <strong>Decisión: NO PEDIR</strong><br />
                    El stock actual ({formatearNumero(stock_actual + inventario_en_transito)} unidades) es suficiente.
                    No es necesario hacer pedido en este momento.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Información adicional */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 flex items-start gap-2">
              <Calculator className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Método de cálculo:</strong> {datos.metodo_calculo || 'NIVEL_OBJETIVO_V2'}<br />
                <strong>Fecha de cálculo:</strong> {new Date(datos_calculo.timestamp).toLocaleString('es-VE')}<br />
                <strong>Fuente de datos:</strong> Análisis de 8 semanas de ventas históricas
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end rounded-b-lg border-t sticky bottom-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
