import { useState, useEffect } from 'react';
import http from '../../services/http';

interface ConfigProducto {
  id: string;
  codigo_producto: string;
  descripcion_producto?: string;
  tienda_id: string;
  tienda_nombre?: string;
  categoria_producto: 'frio' | 'verde';
  stock_min_multiplicador: number;
  stock_seg_multiplicador: number;
  stock_max_multiplicador: number;
  lead_time_dias: number;
  dias_vida_util: number | null;
  umbral_merma_pct: number | null;
}

interface Tienda {
  ubicacion_id: string;
  ubicacion_nombre: string;
}

export default function ConfiguracionProductos() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [selectedTienda, setSelectedTienda] = useState<string>('');
  const [selectedCategoria, setSelectedCategoria] = useState<'frio' | 'verde'>('frio');
  const [configs, setConfigs] = useState<ConfigProducto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTiendas();
  }, []);

  useEffect(() => {
    if (selectedTienda) {
      loadConfigs();
    }
  }, [selectedTienda, selectedCategoria]);

  const loadTiendas = async () => {
    try {
      const response = await http.get('/api/ubicaciones');
      const tiendasFiltradas = response.data.filter(
        (u: any) => u.tipo === 'tienda' && !u.id.startsWith('cedi_')
      );
      // Mapear a la estructura esperada
      const tiendasMapeadas = tiendasFiltradas.map((t: any) => ({
        ubicacion_id: t.id,
        ubicacion_nombre: t.nombre
      }));
      setTiendas(tiendasMapeadas);
      if (tiendasMapeadas.length > 0) {
        setSelectedTienda(tiendasMapeadas[0].ubicacion_id);
      }
    } catch (error) {
      console.error('Error cargando tiendas:', error);
    }
  };

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await http.get('/api/config-inventario/productos', {
        params: {
          tienda_id: selectedTienda,
          categoria: selectedCategoria,
        },
      });
      setConfigs(response.data);
    } catch (error) {
      console.error('Error cargando configuración:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta configuración? El producto usará la configuración por tienda.')) {
      return;
    }

    try {
      await http.delete(`/api/config-inventario/productos/${id}`);
      await loadConfigs();
    } catch (error) {
      console.error('Error eliminando configuración:', error);
      alert('Error eliminando configuración');
    }
  };

  const getCategoriaIcon = (categoria: string) => {
    return categoria === 'frio' ? '❄️' : '🥬';
  };

  const filteredConfigs = configs.filter((config) =>
    config.codigo_producto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    config.descripcion_producto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm text-amber-700">
              <strong>Configuración Individual:</strong> Los productos Frío (Carnicería, Charcutería) y Verde (Fruver, Víveres) pueden tener configuración personalizada por producto. Esto sobrescribe la configuración por tienda.
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tienda
            </label>
            <select
              value={selectedTienda}
              onChange={(e) => setSelectedTienda(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {tiendas.map((tienda) => (
                <option key={tienda.ubicacion_id} value={tienda.ubicacion_id}>
                  {tienda.ubicacion_nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría
            </label>
            <select
              value={selectedCategoria}
              onChange={(e) => setSelectedCategoria(e.target.value as 'frio' | 'verde')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="frio">❄️ Frío</option>
              <option value="verde">🥬 Verde</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar Producto
            </label>
            <input
              type="text"
              placeholder="Código o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            + Agregar Configuración
          </button>
        </div>
      </div>

      {/* Lista de Configuraciones */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Cargando configuración...</div>
        </div>
      ) : filteredConfigs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">{getCategoriaIcon(selectedCategoria)}</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay configuraciones individuales
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Los productos de esta categoría usan la configuración por tienda.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Agregar Primera Configuración
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredConfigs.map((config) => (
            <div
              key={config.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-2xl">{getCategoriaIcon(config.categoria_producto)}</span>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {config.codigo_producto}
                      </h3>
                      {config.descripcion_producto && (
                        <p className="text-sm text-gray-600">{config.descripcion_producto}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <span className="text-xs font-medium text-gray-500">Stock Mínimo</span>
                      <p className="text-lg font-semibold text-gray-900">
                        {config.stock_min_multiplicador}x
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Stock Seguridad</span>
                      <p className="text-lg font-semibold text-gray-900">
                        {config.stock_seg_multiplicador}x
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Stock Máximo</span>
                      <p className="text-lg font-semibold text-gray-900">
                        {config.stock_max_multiplicador}x
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">Lead Time</span>
                      <p className="text-lg font-semibold text-gray-900">
                        {config.lead_time_dias} días
                      </p>
                    </div>
                  </div>

                  {(config.dias_vida_util || config.umbral_merma_pct) && (
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                      {config.dias_vida_util && (
                        <div>
                          <span className="text-xs font-medium text-gray-500">Días Vida Útil</span>
                          <p className="text-sm font-medium text-gray-900">
                            {config.dias_vida_util} días
                          </p>
                        </div>
                      )}
                      {config.umbral_merma_pct && (
                        <div>
                          <span className="text-xs font-medium text-gray-500">Umbral Merma</span>
                          <p className="text-sm font-medium text-gray-900">
                            {config.umbral_merma_pct}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleDelete(config.id)}
                    className="px-3 py-1 text-sm font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal Placeholder */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Agregar Configuración Individual
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Esta funcionalidad estará disponible próximamente. Por ahora, los productos usan la configuración por tienda.
            </p>
            <button
              onClick={() => setShowAddModal(false)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
