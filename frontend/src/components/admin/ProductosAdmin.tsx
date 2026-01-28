import { useState, useEffect, useCallback } from 'react';
import http from '../../services/http';

interface Producto {
  codigo: string;
  descripcion: string;
  categoria: string | null;
  grupo: string | null;
  marca: string | null;
  presentacion: string | null;
  cuadrante: string | null;
  unidad_pedido: string | null;
  unidades_por_bulto: number | null;
  peso_unitario: number | null;
  volumen_unitario: number | null;
  cedi_origen_id: string | null;
  activo: boolean;
  updated_at: string | null;
}

interface ProductoUpdateData {
  unidades_por_bulto?: number;
  unidad_pedido?: string;
  cuadrante?: string;
  peso_unitario?: number;
  volumen_unitario?: number;
  marca?: string;
  presentacion?: string;
}

interface Opcion {
  valor: string;
  cantidad: number;
}

const UNIDADES_PEDIDO = ['Bulto', 'Unidad', 'KG', 'LT', 'MT', 'Caja', 'Paquete'];

export default function ProductosAdmin() {
  // Lista de productos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Paginación y filtros
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('');
  const [cuadranteFilter, setCuadranteFilter] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [soloSinPeso, setSoloSinPeso] = useState(false);
  const [soloSinCuadrante, setSoloSinCuadrante] = useState(false);

  // Opciones para selectores
  const [cuadrantes, setCuadrantes] = useState<Opcion[]>([]);
  const [marcas, setMarcas] = useState<Opcion[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);

  // Modal de edición
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [formData, setFormData] = useState<ProductoUpdateData>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Cargar opciones al inicio
  useEffect(() => {
    loadOpciones();
  }, []);

  // Cargar productos cuando cambian filtros
  useEffect(() => {
    const debounce = setTimeout(() => {
      loadProductos();
    }, 300);
    return () => clearTimeout(debounce);
  }, [page, searchTerm, categoriaFilter, cuadranteFilter, marcaFilter, soloSinPeso, soloSinCuadrante]);

  // Limpiar mensajes después de 5 segundos
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const loadOpciones = async () => {
    try {
      const [cuadrantesRes, marcasRes, categoriasRes] = await Promise.all([
        http.get('/api/admin/productos/opciones/cuadrantes'),
        http.get('/api/admin/productos/opciones/marcas'),
        http.get('/api/admin/productos/opciones/categorias')
      ]);
      setCuadrantes(cuadrantesRes.data);
      setMarcas(marcasRes.data);
      setCategorias(categoriasRes.data);
    } catch (err) {
      console.error('Error cargando opciones:', err);
    }
  };

  const loadProductos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('page_size', pageSize.toString());
      if (searchTerm.length >= 2) params.append('search', searchTerm);
      if (categoriaFilter) params.append('categoria', categoriaFilter);
      if (cuadranteFilter) params.append('cuadrante', cuadranteFilter);
      if (marcaFilter) params.append('marca', marcaFilter);
      if (soloSinPeso) params.append('solo_sin_peso', 'true');
      if (soloSinCuadrante) params.append('solo_sin_cuadrante', 'true');

      const response = await http.get(`/api/admin/productos?${params.toString()}`);
      setProductos(response.data.productos);
      setTotal(response.data.total);
      setTotalPages(response.data.total_pages);
    } catch (err) {
      console.error('Error cargando productos:', err);
      setError('Error cargando productos');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, categoriaFilter, cuadranteFilter, marcaFilter, soloSinPeso, soloSinCuadrante]);

  const handleEdit = (producto: Producto) => {
    setSelectedProducto(producto);
    setFormData({
      unidades_por_bulto: producto.unidades_por_bulto ?? 1,
      unidad_pedido: producto.unidad_pedido ?? 'Bulto',
      cuadrante: producto.cuadrante ?? '',
      peso_unitario: producto.peso_unitario ?? undefined,
      volumen_unitario: producto.volumen_unitario ?? undefined,
      marca: producto.marca ?? '',
      presentacion: producto.presentacion ?? ''
    });
    setShowEditModal(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!selectedProducto) return;

    try {
      setSaving(true);
      setError(null);

      // Solo enviar campos que cambiaron
      const updateData: ProductoUpdateData = {};
      if (formData.unidades_por_bulto !== selectedProducto.unidades_por_bulto) {
        updateData.unidades_por_bulto = formData.unidades_por_bulto;
      }
      if (formData.unidad_pedido !== selectedProducto.unidad_pedido) {
        updateData.unidad_pedido = formData.unidad_pedido;
      }
      if (formData.cuadrante !== (selectedProducto.cuadrante ?? '')) {
        updateData.cuadrante = formData.cuadrante;
      }
      if (formData.peso_unitario !== selectedProducto.peso_unitario) {
        updateData.peso_unitario = formData.peso_unitario;
      }
      if (formData.volumen_unitario !== selectedProducto.volumen_unitario) {
        updateData.volumen_unitario = formData.volumen_unitario;
      }
      if (formData.marca !== (selectedProducto.marca ?? '')) {
        updateData.marca = formData.marca;
      }
      if (formData.presentacion !== (selectedProducto.presentacion ?? '')) {
        updateData.presentacion = formData.presentacion;
      }

      if (Object.keys(updateData).length === 0) {
        setShowEditModal(false);
        return;
      }

      await http.put(`/api/admin/productos/${selectedProducto.codigo}`, updateData);
      setSuccess(`Producto "${selectedProducto.codigo}" actualizado correctamente`);
      setShowEditModal(false);
      setSelectedProducto(null);
      await loadProductos();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error actualizando producto');
    } finally {
      setSaving(false);
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoriaFilter('');
    setCuadranteFilter('');
    setMarcaFilter('');
    setSoloSinPeso(false);
    setSoloSinCuadrante(false);
    setPage(1);
  };

  const formatNumber = (num: number | null, decimals: number = 4) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(decimals);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Administración de Productos</h1>
          <p className="mt-1 text-sm text-gray-600">
            Editar características de productos: peso, volumen, cuadrante, unidades por bulto
          </p>
        </div>

        {/* Mensajes de éxito/error */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-700">{success}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Búsqueda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Código o descripción..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select
                value={categoriaFilter}
                onChange={(e) => { setCategoriaFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Todas</option>
                {categorias.map(cat => (
                  <option key={cat.valor} value={cat.valor}>{cat.valor} ({cat.cantidad})</option>
                ))}
              </select>
            </div>

            {/* Cuadrante */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuadrante</label>
              <select
                value={cuadranteFilter}
                onChange={(e) => { setCuadranteFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Todos</option>
                {cuadrantes.map(q => (
                  <option key={q.valor} value={q.valor}>{q.valor} ({q.cantidad})</option>
                ))}
              </select>
            </div>

            {/* Marca */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <select
                value={marcaFilter}
                onChange={(e) => { setMarcaFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Todas</option>
                {marcas.map(m => (
                  <option key={m.valor} value={m.valor}>{m.valor} ({m.cantidad})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checkboxes y botón limpiar */}
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={soloSinPeso}
                onChange={(e) => { setSoloSinPeso(e.target.checked); setPage(1); }}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">Solo sin peso</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={soloSinCuadrante}
                onChange={(e) => { setSoloSinCuadrante(e.target.checked); setPage(1); }}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">Solo sin cuadrante</span>
            </label>
            <button
              onClick={handleClearFilters}
              className="ml-auto text-sm text-gray-500 hover:text-gray-700"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        {/* Resumen */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            {total.toLocaleString()} productos encontrados
          </p>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto"></div>
              <p className="mt-2 text-gray-500">Cargando productos...</p>
            </div>
          ) : productos.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No se encontraron productos con los filtros seleccionados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuadrante</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Und/Bulto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Peso (kg)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Volumen (m³)</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {productos.map((producto) => (
                    <tr key={producto.codigo} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">{producto.codigo}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={producto.descripcion}>
                        {producto.descripcion}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{producto.categoria || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        {producto.cuadrante && producto.cuadrante !== 'NO ESPECIFICADO' ? (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">{producto.cuadrante}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-900">{producto.unidades_por_bulto || 1}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatNumber(producto.peso_unitario, 4)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatNumber(producto.volumen_unitario, 6)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleEdit(producto)}
                          className="text-teal-600 hover:text-teal-800 font-medium text-sm"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Página {page} de {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal de Edición */}
        {showEditModal && selectedProducto && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Editar Producto</h3>
                  <p className="text-sm text-gray-500 font-mono">{selectedProducto.codigo}</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedProducto.descripcion}</p>
                </div>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                {/* Fila 1: Unidades por bulto y Unidad de pedido */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unidades por Bulto
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={formData.unidades_por_bulto || ''}
                      onChange={(e) => setFormData({...formData, unidades_por_bulto: parseInt(e.target.value) || 1})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unidad de Pedido
                    </label>
                    <select
                      value={formData.unidad_pedido || 'Bulto'}
                      onChange={(e) => setFormData({...formData, unidad_pedido: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                    >
                      {UNIDADES_PEDIDO.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Fila 2: Cuadrante */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuadrante
                  </label>
                  <select
                    value={formData.cuadrante || ''}
                    onChange={(e) => setFormData({...formData, cuadrante: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Sin especificar</option>
                    <option value="NO ESPECIFICADO">NO ESPECIFICADO</option>
                    {cuadrantes.map(q => (
                      <option key={q.valor} value={q.valor}>{q.valor}</option>
                    ))}
                  </select>
                </div>

                {/* Fila 3: Peso y Volumen */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Peso Unitario (kg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formData.peso_unitario ?? ''}
                      onChange={(e) => setFormData({...formData, peso_unitario: e.target.value ? parseFloat(e.target.value) : undefined})}
                      placeholder="0.0000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Volumen Unitario (m³)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.000001"
                      value={formData.volumen_unitario ?? ''}
                      onChange={(e) => setFormData({...formData, volumen_unitario: e.target.value ? parseFloat(e.target.value) : undefined})}
                      placeholder="0.000000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Fila 4: Marca y Presentación */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marca
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={formData.marca || ''}
                      onChange={(e) => setFormData({...formData, marca: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Presentación
                    </label>
                    <input
                      type="text"
                      maxLength={50}
                      value={formData.presentacion || ''}
                      onChange={(e) => setFormData({...formData, presentacion: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Info adicional */}
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <p><strong>CEDI Origen:</strong> {selectedProducto.cedi_origen_id || 'No asignado'}</p>
                  <p><strong>Categoría:</strong> {selectedProducto.categoria || '-'}</p>
                  <p><strong>Grupo:</strong> {selectedProducto.grupo || '-'}</p>
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
