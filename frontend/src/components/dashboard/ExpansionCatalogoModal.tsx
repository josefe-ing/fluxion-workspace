import { useState, useEffect } from 'react';
import http from '../../services/http';
import { formatNumber } from '../../utils/formatNumber';

interface ExpansionItem {
  producto_id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  tiendas_con_producto: number;
  total_tiendas: number;
  cobertura_porcentaje: number;
  venta_promedio_donde_hay: number;
  clase_abc_predominante: string;
  tiendas_sin_producto: string[];
}

interface ExpansionCatalogoResponse {
  region: string;
  cobertura_minima_filtro: number;
  cobertura_maxima_filtro: number;
  total_oportunidades: number;
  productos: ExpansionItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  region?: string;
}

export default function ExpansionCatalogoModal({ isOpen, onClose, region }: Props) {
  const [data, setData] = useState<ExpansionCatalogoResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [coberturaMax, setCoberturaMax] = useState(50);
  const [minVentaSemanal, setMinVentaSemanal] = useState(5);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, coberturaMax, minVentaSemanal, region]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cobertura_max: coberturaMax.toString(),
        min_venta_semanal: minVentaSemanal.toString(),
        limit: '50'
      });
      if (region) params.append('region', region);

      const response = await http.get(`/api/inventario/expansion-catalogo?${params}`);
      setData(response.data || []);
    } catch (error) {
      console.error('Error cargando expansión catálogo:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Expansión de Catálogo</h2>
            <p className="text-sm text-gray-500 mt-1">
              Productos con buenas ventas pero baja cobertura de tiendas
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Cobertura máx:</label>
            <select
              value={coberturaMax}
              onChange={(e) => setCoberturaMax(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value={10}>{'<='} 10%</option>
              <option value={25}>{'<='} 25%</option>
              <option value={50}>{'<='} 50%</option>
              <option value={75}>{'<='} 75%</option>
              <option value={90}>{'<='} 90%</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Min. venta semanal:</label>
            <select
              value={minVentaSemanal}
              onChange={(e) => setMinVentaSemanal(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value={1}>{'>'} 1 und</option>
              <option value={5}>{'>'} 5 und</option>
              <option value={10}>{'>'} 10 und</option>
              <option value={20}>{'>'} 20 und</option>
              <option value={50}>{'>'} 50 und</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-gray-500">Cargando...</div>
            </div>
          ) : data.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              No se encontraron oportunidades con los filtros actuales
            </div>
          ) : (
            <div className="space-y-6">
              {data.map((regionData) => (
                <div key={regionData.region} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Region Header */}
                  <div className="bg-green-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
                        {regionData.region}
                      </span>
                      <span className="text-sm text-gray-600">
                        {regionData.total_oportunidades} productos con potencial de expansión
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Cobertura {'<='} {regionData.cobertura_maxima_filtro}%
                    </div>
                  </div>

                  {/* Productos Table */}
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">ABC</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cobertura</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Venta Sem/Tienda</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tiendas Potenciales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {regionData.productos.map((item) => (
                        <tr key={item.producto_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{item.descripcion}</div>
                            <div className="text-xs text-gray-500">{item.codigo} - {item.categoria}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${
                              item.clase_abc_predominante === 'A' ? 'bg-red-100 text-red-700' :
                              item.clase_abc_predominante === 'B' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {item.clase_abc_predominante}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full"
                                  style={{ width: `${item.cobertura_porcentaje}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-gray-700">
                                {item.tiendas_con_producto}/{item.total_tiendas}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-green-600">
                              {formatNumber(item.venta_promedio_donde_hay, 1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {item.tiendas_sin_producto?.slice(0, 5).map((tienda, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                                >
                                  {tienda}
                                </span>
                              ))}
                              {(item.tiendas_sin_producto?.length || 0) > 5 && (
                                <span className="text-xs text-gray-400">
                                  +{item.tiendas_sin_producto.length - 5} más
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
