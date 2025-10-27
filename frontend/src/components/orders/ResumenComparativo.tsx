import { formatNumber } from '../../utils/formatNumber';

interface ResumenStats {
  total_productos: number;
  coincidencias: number;
  xyz_mayor: number;
  xyz_menor: number;
  diferencia_total_bultos: number;
  diferencia_total_costo: number;
  reduccion_stockouts_estimada: number;
  productos_con_riesgo: number;
}

interface Props {
  stats: ResumenStats;
}

export default function ResumenComparativo({ stats }: Props) {
  const porcentajeCoincidencia = Math.round((stats.coincidencias / stats.total_productos) * 100);
  const porcentajeMayor = Math.round((stats.xyz_mayor / stats.total_productos) * 100);
  const porcentajeMenor = Math.round((stats.xyz_menor / stats.total_productos) * 100);

  return (
    <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 rounded-lg border-2 border-indigo-300 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📊</span>
        <h3 className="text-lg font-bold text-gray-900">
          Resumen de Comparación: ABC vs XYZ Mejorado
        </h3>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Total Productos */}
        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
          <div className="text-xs text-gray-500 mb-1">Total Productos</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total_productos}</div>
        </div>

        {/* Coincidencias */}
        <div className="bg-green-50 rounded-lg p-3 shadow-sm border border-green-300">
          <div className="text-xs text-green-700 mb-1 flex items-center gap-1">
            <span>✅</span>
            Coincidencias (±2 bultos)
          </div>
          <div className="text-2xl font-bold text-green-800">
            {stats.coincidencias}
            <span className="text-sm ml-1">({porcentajeCoincidencia}%)</span>
          </div>
        </div>

        {/* XYZ Sugiere MÁS */}
        <div className="bg-red-50 rounded-lg p-3 shadow-sm border border-red-300">
          <div className="text-xs text-red-700 mb-1 flex items-center gap-1">
            <span>🔺</span>
            XYZ Sugiere MÁS
          </div>
          <div className="text-2xl font-bold text-red-800">
            {stats.xyz_mayor}
            <span className="text-sm ml-1">({porcentajeMayor}%)</span>
          </div>
          <div className="text-xs text-red-600 mt-1">
            +{stats.diferencia_total_bultos} bultos total
          </div>
        </div>

        {/* XYZ Sugiere MENOS */}
        <div className="bg-blue-50 rounded-lg p-3 shadow-sm border border-blue-300">
          <div className="text-xs text-blue-700 mb-1 flex items-center gap-1">
            <span>🔻</span>
            XYZ Sugiere MENOS
          </div>
          <div className="text-2xl font-bold text-blue-800">
            {stats.xyz_menor}
            <span className="text-sm ml-1">({porcentajeMenor}%)</span>
          </div>
        </div>
      </div>

      {/* Impacto Estimado */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-200">
        <div className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
          <span>💡</span>
          Impacto Estimado del Método XYZ
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-600 mb-1">Reducción de Stockouts</div>
            <div className="text-xl font-bold text-green-700">
              -{stats.reduccion_stockouts_estimada}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">vs. histórico</div>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Ajuste de Inventario</div>
            <div className="text-xl font-bold text-blue-700">
              +${formatNumber(stats.diferencia_total_costo, 2)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              +{((stats.diferencia_total_costo / 47000) * 100).toFixed(1)}% capital
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Productos con Riesgo</div>
            <div className="text-xl font-bold text-red-700 flex items-center gap-1">
              {stats.productos_con_riesgo}
              <span className="text-sm">🚨</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">detectados por XYZ</div>
          </div>
        </div>
      </div>

      {/* Nota Informativa */}
      <div className="mt-3 p-3 bg-indigo-100 rounded-lg border border-indigo-300">
        <div className="text-xs text-indigo-900 flex items-start gap-2">
          <span className="text-sm">💬</span>
          <div>
            <strong>Método XYZ</strong> analiza la variabilidad de demanda, detecta tendencias y ajusta por estacionalidad.
            Las diferencias mostradas optimizan el balance entre riesgo de stockout y exceso de inventario.
          </div>
        </div>
      </div>
    </div>
  );
}
