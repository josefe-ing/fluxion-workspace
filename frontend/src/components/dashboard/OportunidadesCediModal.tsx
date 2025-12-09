import { useState, useEffect } from 'react';
import http from '../../services/http';
import { formatNumber } from '../../utils/formatNumber';

interface StockTiendaDetalle {
  tienda_id: string;
  tienda_nombre: string;
  stock: number;
  p75_diario: number;
}

interface OportunidadCediItem {
  producto_id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  stock_cedi_unidades: number;
  stock_cedi_bultos: number;
  unidades_por_bulto: number;
  clase_abc_predominante: string;
  tiendas: StockTiendaDetalle[];
}

interface OportunidadesCediResponse {
  region: string;
  cedi_id: string;
  cedi_nombre: string;
  umbral_stock_bajo: number;
  total_oportunidades: number;
  productos: OportunidadCediItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  region?: string;
}

type SortDirection = 'asc' | 'desc';

export default function OportunidadesCediModal({ isOpen, onClose, region }: Props) {
  const [data, setData] = useState<OportunidadesCediResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [umbralStock, setUmbralStock] = useState(5);
  const [minStockCedi, setMinStockCedi] = useState(10);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, umbralStock, minStockCedi, region]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        umbral_stock: umbralStock.toString(),
        min_stock_cedi: minStockCedi.toString(),
        limit: '50'
      });
      if (region) params.append('region', region);

      const response = await http.get(`/api/inventario/oportunidades-cedi?${params}`);
      setData(response.data || []);
    } catch (error) {
      console.error('Error cargando oportunidades CEDI:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función para obtener color de stock basado en P75
  const getStockColor = (stock: number, p75: number, umbral: number): string => {
    if (stock <= umbral) return 'text-red-600 font-semibold';
    if (p75 > 0 && stock < p75 * 3) return 'text-yellow-600';
    return 'text-gray-900';
  };

  // Función para ordenar productos
  const sortProductos = (productos: OportunidadCediItem[]): OportunidadCediItem[] => {
    return [...productos].sort((a, b) => {
      const diff = a.stock_cedi_bultos - b.stock_cedi_bultos;
      return sortDirection === 'desc' ? -diff : diff;
    });
  };

  // Toggle sort direction
  const toggleSort = () => {
    setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Oportunidades CEDI</h2>
            <p className="text-sm text-gray-500 mt-1">
              Productos con stock en CEDI pero bajo stock en tiendas
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
            <label className="text-sm font-medium text-gray-600">Stock bajo si:</label>
            <select
              value={umbralStock}
              onChange={(e) => setUmbralStock(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value={0}>= 0</option>
              <option value={3}>{'<='} 3</option>
              <option value={5}>{'<='} 5</option>
              <option value={10}>{'<='} 10</option>
              <option value={20}>{'<='} 20</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Min. stock CEDI:</label>
            <select
              value={minStockCedi}
              onChange={(e) => setMinStockCedi(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              <option value={1}>{'>'} 1</option>
              <option value={10}>{'>'} 10</option>
              <option value={50}>{'>'} 50</option>
              <option value={100}>{'>'} 100</option>
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
              {data.map((cediData) => (
                <div key={cediData.cedi_id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* CEDI Header */}
                  <div className="bg-purple-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded">
                        {cediData.cedi_nombre}
                      </span>
                      <span className="text-sm text-gray-600">
                        {cediData.total_oportunidades} productos
                      </span>
                    </div>
                  </div>

                  {/* Productos Table con scroll horizontal */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10">Producto</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">ABC</th>
                          <th
                            className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                            onClick={toggleSort}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Stock CEDI (bultos)
                              <svg className={`w-4 h-4 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </th>
                        {/* Columnas dinámicas por tienda */}
                        {cediData.productos[0]?.tiendas.map((tienda, idx) => (
                          <th key={`${tienda.tienda_id}-${idx}`} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                            {tienda.tienda_nombre}
                            <div className="text-[10px] text-gray-400 font-normal normal-case">(Stock / P75)</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sortProductos(cediData.productos).map((item) => (
                        <tr key={item.producto_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 sticky left-0 bg-white z-10">
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
                          <td className="px-4 py-3 text-right">
                            <div className="text-sm font-medium text-gray-900">
                              {formatNumber(item.stock_cedi_bultos, 1)}
                            </div>
                            <div className="text-xs text-gray-400">
                              ({formatNumber(item.stock_cedi_unidades, 0)} und)
                            </div>
                          </td>
                          {/* Columnas de stock por tienda */}
                          {item.tiendas.map((tienda, idx) => (
                            <td key={`${tienda.tienda_id}-${idx}`} className="px-3 py-3 text-center">
                              <span className={`text-sm ${getStockColor(tienda.stock, tienda.p75_diario, umbralStock)}`}>
                                {formatNumber(tienda.stock, 0)}
                              </span>
                              <span className="text-xs text-gray-400 ml-1">
                                / {formatNumber(tienda.p75_diario, 1)}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
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
