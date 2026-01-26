import { useState, useEffect, useCallback } from 'react';
import {
  listarExclusionesInterCedi,
  crearExclusionInterCedi,
  cargaMasivaExclusiones,
  eliminarExclusionInterCedi,
  buscarProductosParaExcluir,
  obtenerEstadisticasExclusiones,
  ProductoExcluidoInterCedi,
  ProductoBusqueda,
  EstadisticasExclusiones,
  CargaMasivaResponse,
  MOTIVOS_EXCLUSION,
  CEDIS_DESTINO,
} from '../../services/exclusionesInterCediService';

export default function ExclusionesInterCedi() {
  // Estado principal
  const [exclusiones, setExclusiones] = useState<ProductoExcluidoInterCedi[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasExclusiones | null>(null);
  const [loading, setLoading] = useState(true);
  const [cediDestinoId, setCediDestinoId] = useState('cedi_caracas');

  // Búsqueda y filtros
  const [searchFilter, setSearchFilter] = useState('');
  const [motivoFilter, setMotivoFilter] = useState('');

  // Agregar individual
  const [showAgregarModal, setShowAgregarModal] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productosEncontrados, setProductosEncontrados] = useState<ProductoBusqueda[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoBusqueda | null>(null);
  const [motivoNuevo, setMotivoNuevo] = useState('MANUAL');
  const [observacionesNuevo, setObservacionesNuevo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [agregando, setAgregando] = useState(false);

  // Carga masiva
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [codigosBulk, setCodigosBulk] = useState('');
  const [motivoBulk, setMotivoBulk] = useState('MANUAL');
  const [observacionesBulk, setObservacionesBulk] = useState('');
  const [cargandoBulk, setCargandoBulk] = useState(false);
  const [resultadoBulk, setResultadoBulk] = useState<CargaMasivaResponse | null>(null);

  // Cargar datos
  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      const [exclusionesData, estadisticasData] = await Promise.all([
        listarExclusionesInterCedi(cediDestinoId, {
          search: searchFilter || undefined,
          motivo: motivoFilter || undefined,
          limit: 500,
        }),
        obtenerEstadisticasExclusiones(cediDestinoId),
      ]);
      setExclusiones(exclusionesData);
      setEstadisticas(estadisticasData);
    } catch (error) {
      console.error('Error cargando exclusiones:', error);
    } finally {
      setLoading(false);
    }
  }, [cediDestinoId, searchFilter, motivoFilter]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Buscar productos para agregar
  const buscarProductos = async (search: string) => {
    if (search.length < 2) {
      setProductosEncontrados([]);
      return;
    }

    try {
      setBuscando(true);
      const productos = await buscarProductosParaExcluir(cediDestinoId, search);
      setProductosEncontrados(productos);
    } catch (error) {
      console.error('Error buscando productos:', error);
    } finally {
      setBuscando(false);
    }
  };

  // Agregar exclusión individual
  const agregarExclusion = async () => {
    if (!productoSeleccionado) return;

    try {
      setAgregando(true);
      await crearExclusionInterCedi({
        cedi_destino_id: cediDestinoId,
        codigo_producto: productoSeleccionado.codigo,
        motivo: motivoNuevo,
        observaciones: observacionesNuevo || undefined,
      });

      // Limpiar y cerrar
      setShowAgregarModal(false);
      setProductoSeleccionado(null);
      setBusquedaProducto('');
      setProductosEncontrados([]);
      setObservacionesNuevo('');
      setMotivoNuevo('MANUAL');

      // Recargar
      await cargarDatos();
    } catch (error) {
      console.error('Error agregando exclusión:', error);
      alert('Error agregando exclusión');
    } finally {
      setAgregando(false);
    }
  };

  // Carga masiva
  const ejecutarCargaMasiva = async () => {
    const codigos = codigosBulk
      .split(/[\n,;]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (codigos.length === 0) {
      alert('No se proporcionaron códigos válidos');
      return;
    }

    try {
      setCargandoBulk(true);
      const resultado = await cargaMasivaExclusiones({
        cedi_destino_id: cediDestinoId,
        codigos_productos: codigos,
        motivo: motivoBulk,
        observaciones: observacionesBulk || undefined,
      });

      setResultadoBulk(resultado);

      // Recargar datos
      await cargarDatos();
    } catch (error) {
      console.error('Error en carga masiva:', error);
      alert('Error en carga masiva');
    } finally {
      setCargandoBulk(false);
    }
  };

  // Eliminar exclusión
  const eliminarExclusion = async (id: number, codigo: string) => {
    if (!confirm(`¿Eliminar exclusión del producto ${codigo}?`)) return;

    try {
      await eliminarExclusionInterCedi(id);
      await cargarDatos();
    } catch (error) {
      console.error('Error eliminando exclusión:', error);
      alert('Error eliminando exclusión');
    }
  };

  // Cerrar modal de carga masiva
  const cerrarBulkModal = () => {
    setShowBulkModal(false);
    setCodigosBulk('');
    setMotivoBulk('MANUAL');
    setObservacionesBulk('');
    setResultadoBulk(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Exclusiones Inter-CEDI</h1>
        <p className="text-gray-600 mt-1">
          Productos que NO aparecen en pedidos de reposición entre CEDIs
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <span className="text-amber-500 mr-2">⚠️</span>
          <div>
            <p className="text-sm text-amber-800">
              <strong>Nota:</strong> Los productos en esta lista no serán incluidos al calcular
              pedidos inter-CEDI. Útil para productos que se compran localmente, se piden directo
              a tienda, o están descontinuados.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de CEDI y estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">CEDI Destino</label>
          <select
            value={cediDestinoId}
            onChange={(e) => setCediDestinoId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            {CEDIS_DESTINO.map((cedi) => (
              <option key={cedi.id} value={cedi.id}>
                {cedi.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Total Excluidos</div>
          <div className="text-2xl font-bold text-gray-900">
            {estadisticas?.total_excluidos ?? '-'}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Por Motivo Principal</div>
          <div className="text-lg font-semibold text-gray-900">
            {estadisticas?.por_motivo
              ? Object.entries(estadisticas.por_motivo)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 1)
                  .map(([motivo, count]) => `${motivo}: ${count}`)
                  .join(', ') || '-'
              : '-'}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600">Por CEDI Origen</div>
          <div className="text-sm text-gray-900">
            {estadisticas?.por_cedi_origen
              ? Object.entries(estadisticas.por_cedi_origen)
                  .map(([cedi, count]) => `${cedi.replace('cedi_', '')}: ${count}`)
                  .join(', ') || '-'
              : '-'}
          </div>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={() => setShowAgregarModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <span>+</span> Agregar Producto
        </button>

        <button
          onClick={() => setShowBulkModal(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
        >
          <span>📋</span> Carga Masiva
        </button>

        <div className="flex-1" />

        <input
          type="text"
          placeholder="Buscar por código o descripción..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 w-64"
        />

        <select
          value={motivoFilter}
          onChange={(e) => setMotivoFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2"
        >
          <option value="">Todos los motivos</option>
          {MOTIVOS_EXCLUSION.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla de exclusiones */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Descripción
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Categoría
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                CEDI Origen
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Motivo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Fecha
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : exclusiones.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No hay productos excluidos
                </td>
              </tr>
            ) : (
              exclusiones.map((exc) => (
                <tr key={exc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{exc.codigo_producto}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {exc.descripcion_producto || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{exc.categoria || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {exc.cedi_origen_id?.replace('cedi_', '') || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        exc.motivo === 'MANUAL'
                          ? 'bg-blue-100 text-blue-800'
                          : exc.motivo === 'DESCONTINUADO'
                          ? 'bg-red-100 text-red-800'
                          : exc.motivo === 'SOLO_TIENDA'
                          ? 'bg-purple-100 text-purple-800'
                          : exc.motivo === 'PROVEEDOR_LOCAL'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {MOTIVOS_EXCLUSION.find((m) => m.value === exc.motivo)?.label || exc.motivo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(exc.fecha_creacion).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => eliminarExclusion(exc.id, exc.codigo_producto)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Agregar Individual */}
      {showAgregarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Agregar Producto a Exclusiones</h3>
            </div>
            <div className="p-6 space-y-4">
              {/* Búsqueda de producto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buscar Producto
                </label>
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value);
                    buscarProductos(e.target.value);
                  }}
                  placeholder="Código o descripción..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />

                {/* Resultados de búsqueda */}
                {buscando && <p className="text-sm text-gray-500 mt-2">Buscando...</p>}
                {productosEncontrados.length > 0 && (
                  <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
                    {productosEncontrados.map((p) => (
                      <button
                        key={p.codigo}
                        onClick={() => {
                          setProductoSeleccionado(p);
                          setProductosEncontrados([]);
                          setBusquedaProducto(`${p.codigo} - ${p.descripcion}`);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b last:border-b-0"
                      >
                        <span className="font-mono text-sm">{p.codigo}</span>
                        <span className="text-gray-600 ml-2">{p.descripcion}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Producto seleccionado */}
              {productoSeleccionado && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm">
                    <strong>Seleccionado:</strong> {productoSeleccionado.codigo} -{' '}
                    {productoSeleccionado.descripcion}
                  </p>
                </div>
              )}

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <select
                  value={motivoNuevo}
                  onChange={(e) => setMotivoNuevo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {MOTIVOS_EXCLUSION.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones (opcional)
                </label>
                <textarea
                  value={observacionesNuevo}
                  onChange={(e) => setObservacionesNuevo(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAgregarModal(false);
                  setProductoSeleccionado(null);
                  setBusquedaProducto('');
                  setProductosEncontrados([]);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={agregarExclusion}
                disabled={!productoSeleccionado || agregando}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {agregando ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Carga Masiva */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Carga Masiva de Exclusiones</h3>
            </div>
            <div className="p-6 space-y-4">
              {!resultadoBulk ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      Pega los códigos de productos a excluir. Puedes separarlos por líneas, comas o
                      punto y coma.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Códigos de Productos
                    </label>
                    <textarea
                      value={codigosBulk}
                      onChange={(e) => setCodigosBulk(e.target.value)}
                      rows={10}
                      placeholder="001234&#10;005678&#10;009012&#10;..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      {codigosBulk
                        .split(/[\n,;]/)
                        .filter((c) => c.trim()).length}{' '}
                      códigos detectados
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                      <select
                        value={motivoBulk}
                        onChange={(e) => setMotivoBulk(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        {MOTIVOS_EXCLUSION.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Observaciones (opcional)
                      </label>
                      <input
                        type="text"
                        value={observacionesBulk}
                        onChange={(e) => setObservacionesBulk(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <h4 className="font-semibold text-lg">Resultado de la Carga</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Total Recibidos</div>
                      <div className="text-2xl font-bold">{resultadoBulk.total_recibidos}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-sm text-green-600">Exitosos</div>
                      <div className="text-2xl font-bold text-green-700">
                        {resultadoBulk.exitosos}
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <div className="text-sm text-yellow-600">Ya Excluidos</div>
                      <div className="text-2xl font-bold text-yellow-700">
                        {resultadoBulk.duplicados}
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <div className="text-sm text-red-600">No Encontrados</div>
                      <div className="text-2xl font-bold text-red-700">
                        {resultadoBulk.no_encontrados}
                      </div>
                    </div>
                  </div>

                  {resultadoBulk.errores.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-800 mb-2">Errores:</p>
                      <ul className="text-sm text-red-700 list-disc list-inside">
                        {resultadoBulk.errores.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={cerrarBulkModal}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                {resultadoBulk ? 'Cerrar' : 'Cancelar'}
              </button>
              {!resultadoBulk && (
                <button
                  onClick={ejecutarCargaMasiva}
                  disabled={cargandoBulk || !codigosBulk.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {cargandoBulk ? 'Procesando...' : 'Cargar Productos'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
