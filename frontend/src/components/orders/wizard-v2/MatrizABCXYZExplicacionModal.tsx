import { X, TrendingUp, BarChart3, Info, AlertCircle } from 'lucide-react';
import { obtenerColorMatriz } from '../../../services/nivelObjetivoService';

interface MatrizABCXYZExplicacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: {
    producto_id: string;
    nombre_producto: string;
    matriz_abc_xyz: string;
  };
  datosClasificacion: {
    // Clasificación ABC
    valor_ventas_total: number;
    percentil_abc: number;
    umbral_a: number;
    umbral_b: number;

    // Clasificación XYZ
    demanda_promedio: number;
    desviacion_estandar: number;
    coeficiente_variacion: number;

    // Parámetros aplicados
    nivel_servicio_z: number;
    multiplicador_demanda: number;
    multiplicador_ss: number;
    incluye_ss: boolean;
    prioridad: number;
  };
}

export default function MatrizABCXYZExplicacionModal({
  isOpen,
  onClose,
  producto,
  datosClasificacion
}: MatrizABCXYZExplicacionModalProps) {
  if (!isOpen) return null;

  const { matriz_abc_xyz } = producto;
  const clasificacionABC = matriz_abc_xyz[0]; // A, B, o C
  const clasificacionXYZ = matriz_abc_xyz[1]; // X, Y, o Z
  const colores = obtenerColorMatriz(matriz_abc_xyz);

  // Calcular percentil para visualización
  const percentilVisual = Math.min(100, datosClasificacion.percentil_abc);

  // Información sobre cada clasificación
  const infoABC: Record<string, { nombre: string; rango: string; descripcion: string; color: string }> = {
    A: {
      nombre: 'Clase A - Alto Valor',
      rango: 'Top 20% de productos',
      descripcion: '80% del valor total de ventas. Productos críticos que generan la mayor parte de los ingresos.',
      color: 'text-red-700 bg-red-50 border-red-300'
    },
    B: {
      nombre: 'Clase B - Valor Medio',
      rango: 'Siguiente 30% de productos',
      descripcion: '15% del valor total de ventas. Productos importantes con rotación media.',
      color: 'text-yellow-700 bg-yellow-50 border-yellow-300'
    },
    C: {
      nombre: 'Clase C - Bajo Valor',
      rango: 'Restante 50% de productos',
      descripcion: '5% del valor total de ventas. Productos de baja rotación o bajo precio.',
      color: 'text-gray-700 bg-gray-50 border-gray-300'
    }
  };

  const infoXYZ: Record<string, { nombre: string; rango: string; descripcion: string; color: string; formula: string }> = {
    X: {
      nombre: 'X - Demanda Estable',
      rango: 'CV < 0.50',
      descripcion: 'Demanda muy predecible y constante. Fácil de planificar.',
      color: 'text-green-700 bg-green-50 border-green-300',
      formula: 'Desviación Estándar ÷ Promedio < 0.50'
    },
    Y: {
      nombre: 'Y - Demanda Variable',
      rango: '0.50 ≤ CV ≤ 1.00',
      descripcion: 'Demanda con variabilidad media. Requiere monitoreo frecuente.',
      color: 'text-yellow-700 bg-yellow-50 border-yellow-300',
      formula: '0.50 ≤ (Desviación Estándar ÷ Promedio) ≤ 1.00'
    },
    Z: {
      nombre: 'Z - Demanda Errática',
      rango: 'CV > 1.00',
      descripcion: 'Demanda muy impredecible con picos irregulares. Difícil de pronosticar.',
      color: 'text-red-700 bg-red-50 border-red-300',
      formula: 'Desviación Estándar ÷ Promedio > 1.00'
    }
  };

  const estrategiasPorMatriz: Record<string, { estrategia: string; nivelServicio: string; stockSeguridad: string }> = {
    AX: {
      estrategia: 'Stock mínimo',
      nivelServicio: '97.5% (Z=1.96)',
      stockSeguridad: 'Estándar (×1.00)'
    },
    AY: {
      estrategia: 'Stock mínimo + buffer',
      nivelServicio: '97.5% (Z=1.96)',
      stockSeguridad: 'Aumentado +25% (×1.25)'
    },
    AZ: {
      estrategia: 'Stock alto',
      nivelServicio: '97.5% (Z=1.96)',
      stockSeguridad: 'Aumentado +50% (×1.50)'
    },
    BX: {
      estrategia: 'Stock moderado',
      nivelServicio: '95.0% (Z=1.65)',
      stockSeguridad: 'Estándar (×1.00)'
    },
    BY: {
      estrategia: 'Stock moderado + buffer',
      nivelServicio: '95.0% (Z=1.65)',
      stockSeguridad: 'Aumentado +10% (×1.10)'
    },
    BZ: {
      estrategia: 'Stock elevado',
      nivelServicio: '95.0% (Z=1.65)',
      stockSeguridad: 'Aumentado +25% (×1.25)'
    },
    CX: {
      estrategia: 'Stock básico',
      nivelServicio: '90.0% (Z=1.28)',
      stockSeguridad: 'Estándar (×1.00)'
    },
    CY: {
      estrategia: 'Stock reducido',
      nivelServicio: '90.0% (Z=1.28)',
      stockSeguridad: 'Reducido -50% (×0.50)'
    },
    CZ: {
      estrategia: 'Sin stock de seguridad',
      nivelServicio: '~50% (Z=0.00)',
      stockSeguridad: 'SIN SS (×0.00)'
    }
  };

  const estrategia = estrategiasPorMatriz[matriz_abc_xyz] || {
    estrategia: 'No especificada',
    nivelServicio: 'N/A',
    stockSeguridad: 'N/A'
  };

  const detalleABC = infoABC[clasificacionABC];
  const detalleXYZ = infoXYZ[clasificacionXYZ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`${colores.bg} ${colores.text} px-6 py-4 border-b-4 ${colores.border} flex items-center justify-between sticky top-0 z-10`}>
          <div className="flex items-center gap-4">
            <BarChart3 className="h-7 w-7" />
            <div>
              <h2 className="text-xl font-bold">Análisis de Clasificación ABC-XYZ</h2>
              <p className="text-sm opacity-90 mt-0.5">
                {producto.producto_id} - {producto.nombre_producto}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:opacity-70 transition-opacity"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Clasificación Combinada - Badge Grande */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Clasificación Asignada</p>
                <div className="flex items-center gap-4">
                  <span className={`
                    ${colores.bg} ${colores.text} text-4xl font-bold px-6 py-3 rounded-lg border-4 ${colores.border}
                  `}>
                    {matriz_abc_xyz}
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {clasificacionABC === 'A' ? 'Alto' : clasificacionABC === 'B' ? 'Medio' : 'Bajo'} Valor
                      {' • '}
                      Demanda {clasificacionXYZ === 'X' ? 'Estable' : clasificacionXYZ === 'Y' ? 'Variable' : 'Errática'}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Prioridad {datosClasificacion.prioridad} de 9
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clasificación ABC - Detalle */}
          <div className={`border-2 ${detalleABC.color.split(' ').find(c => c.startsWith('border-'))} rounded-lg p-5`}>
            <div className="flex items-start gap-3 mb-4">
              <div className={`p-2 rounded-lg ${detalleABC.color}`}>
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Clasificación ABC: {clasificacionABC}
                </h3>
                <p className="text-sm font-semibold text-gray-700">
                  {detalleABC.nombre}
                </p>
              </div>
            </div>

            <div className={`${detalleABC.color} rounded-lg p-4 mb-4`}>
              <p className="text-sm leading-relaxed">
                {detalleABC.descripcion}
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-2">Matemática de Clasificación ABC</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Valor Total de Ventas (8 semanas):</span>
                    <span className="text-sm font-bold text-gray-900">
                      ${datosClasificacion.valor_ventas_total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Percentil ABC:</span>
                    <span className="text-sm font-bold text-gray-900">
                      {percentilVisual.toFixed(1)}% (top {(100 - percentilVisual).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Clase C (Bajo)</span>
                      <span>Clase B (Medio)</span>
                      <span>Clase A (Alto)</span>
                    </div>
                    <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden relative">
                      {/* Zona C: 0-50% */}
                      <div className="absolute left-0 top-0 h-full w-[50%] bg-gray-400"></div>
                      {/* Zona B: 50-80% */}
                      <div className="absolute left-[50%] top-0 h-full w-[30%] bg-yellow-400"></div>
                      {/* Zona A: 80-100% */}
                      <div className="absolute left-[80%] top-0 h-full w-[20%] bg-red-400"></div>
                      {/* Indicador de posición */}
                      <div
                        className="absolute top-0 h-full w-1 bg-indigo-600 border-2 border-white"
                        style={{ left: `${percentilVisual}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0%</span>
                      <span>50%</span>
                      <span>80%</span>
                      <span>100%</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-600">
                      <strong>Criterio:</strong>{' '}
                      {clasificacionABC === 'A' && `Percentil ≥ ${datosClasificacion.umbral_a}% → Clase A`}
                      {clasificacionABC === 'B' && `${datosClasificacion.umbral_b}% ≤ Percentil < ${datosClasificacion.umbral_a}% → Clase B`}
                      {clasificacionABC === 'C' && `Percentil < ${datosClasificacion.umbral_b}% → Clase C`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clasificación XYZ - Detalle */}
          <div className={`border-2 ${detalleXYZ.color.split(' ').find(c => c.startsWith('border-'))} rounded-lg p-5`}>
            <div className="flex items-start gap-3 mb-4">
              <div className={`p-2 rounded-lg ${detalleXYZ.color}`}>
                <BarChart3 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Clasificación XYZ: {clasificacionXYZ}
                </h3>
                <p className="text-sm font-semibold text-gray-700">
                  {detalleXYZ.nombre}
                </p>
              </div>
            </div>

            <div className={`${detalleXYZ.color} rounded-lg p-4 mb-4`}>
              <p className="text-sm leading-relaxed">
                {detalleXYZ.descripcion}
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-3">Matemática de Clasificación XYZ</p>

                {/* Fórmula del CV */}
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 mb-4">
                  <p className="text-xs font-semibold text-indigo-900 mb-2">
                    📐 Coeficiente de Variación (CV)
                  </p>
                  <div className="font-mono text-sm text-center py-3 bg-white rounded border border-indigo-200">
                    CV = σ ÷ μ
                  </div>
                  <p className="text-xs text-indigo-700 mt-2 text-center">
                    σ = Desviación Estándar | μ = Promedio
                  </p>
                </div>

                {/* Cálculo paso a paso */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-700">Demanda Promedio Diaria (μ):</span>
                    <span className="text-sm font-bold font-mono text-gray-900">
                      {datosClasificacion.demanda_promedio.toFixed(2)} unidades/día
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-700">Desviación Estándar (σ):</span>
                    <span className="text-sm font-bold font-mono text-gray-900">
                      {datosClasificacion.desviacion_estandar.toFixed(2)} unidades
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-yellow-50 rounded px-2">
                    <span className="text-sm font-semibold text-gray-900">Coeficiente de Variación (CV):</span>
                    <div className="text-right">
                      <span className="text-lg font-bold font-mono text-yellow-700">
                        {datosClasificacion.coeficiente_variacion.toFixed(4)}
                      </span>
                      <p className="text-xs text-gray-600 font-mono">
                        ({datosClasificacion.desviacion_estandar.toFixed(2)} ÷ {datosClasificacion.demanda_promedio.toFixed(2)})
                      </p>
                    </div>
                  </div>
                </div>

                {/* Escala de clasificación */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-600 mb-3">Escala de Clasificación XYZ</p>
                  <div className="space-y-2">
                    <div className={`flex items-center justify-between p-2 rounded ${clasificacionXYZ === 'X' ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-50'}`}>
                      <span className="text-sm font-semibold text-green-700">X - Muy Predecible</span>
                      <span className="text-xs font-mono text-gray-600">CV &lt; 0.50</span>
                    </div>
                    <div className={`flex items-center justify-between p-2 rounded ${clasificacionXYZ === 'Y' ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-gray-50'}`}>
                      <span className="text-sm font-semibold text-yellow-700">Y - Variable</span>
                      <span className="text-xs font-mono text-gray-600">0.50 ≤ CV ≤ 1.0</span>
                    </div>
                    <div className={`flex items-center justify-between p-2 rounded ${clasificacionXYZ === 'Z' ? 'bg-red-100 border-2 border-red-400' : 'bg-gray-50'}`}>
                      <span className="text-sm font-semibold text-red-700">Z - Muy Errático</span>
                      <span className="text-xs font-mono text-gray-600">CV &gt; 1.0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Estrategia de Reposición */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                <Info className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Estrategia de Reposición Aplicada</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Parámetros automáticos según clasificación {matriz_abc_xyz}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <p className="text-xs font-medium text-purple-600 mb-2">Nivel de Servicio</p>
                <p className="text-2xl font-bold text-purple-900">{estrategia.nivelServicio}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Z-Score: {datosClasificacion.nivel_servicio_z.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <p className="text-xs font-medium text-purple-600 mb-2">Stock de Seguridad</p>
                <p className="text-2xl font-bold text-purple-900">{estrategia.stockSeguridad}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Multiplicador: {datosClasificacion.multiplicador_ss.toFixed(2)}×
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <p className="text-xs font-medium text-purple-600 mb-2">Ajuste de Demanda</p>
                <p className="text-2xl font-bold text-purple-900">
                  {((datosClasificacion.multiplicador_demanda - 1) * 100) > 0 ? '+' : ''}
                  {((datosClasificacion.multiplicador_demanda - 1) * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Multiplicador: {datosClasificacion.multiplicador_demanda.toFixed(2)}×
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <p className="text-xs font-medium text-purple-600 mb-2">Estrategia</p>
                <p className="text-lg font-bold text-purple-900">{estrategia.estrategia}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {datosClasificacion.incluye_ss ? '✓ Con SS' : '✗ Sin SS'}
                </p>
              </div>
            </div>

            <div className="mt-4 bg-purple-100 border border-purple-300 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-purple-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-purple-900">
                  <p className="font-semibold mb-1">¿Qué significa esto?</p>
                  <p className="text-xs leading-relaxed">
                    {clasificacionABC === 'A' && 'Los productos clase A requieren alta disponibilidad (97.5%) porque representan el 80% de los ingresos. '}
                    {clasificacionABC === 'B' && 'Los productos clase B mantienen disponibilidad media (95%) balanceando costo e importancia. '}
                    {clasificacionABC === 'C' && 'Los productos clase C tienen disponibilidad básica (90%) para minimizar inventario inmovilizado. '}
                    {clasificacionXYZ === 'X' && 'Su demanda estable permite planificación precisa con stock de seguridad estándar.'}
                    {clasificacionXYZ === 'Y' && 'Su demanda variable requiere stock de seguridad aumentado para cubrir picos.'}
                    {clasificacionXYZ === 'Z' && clasificacionABC === 'C' ? 'Su demanda errática y bajo valor justifican NO mantener stock de seguridad.' : clasificacionXYZ === 'Z' ? 'Su demanda errática requiere máximo stock de seguridad para evitar quiebres.' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end sticky bottom-0">
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
