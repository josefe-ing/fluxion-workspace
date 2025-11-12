/**
 * Componente de Administración de Conjuntos Sustituibles
 *
 * Permite:
 * - Listar conjuntos existentes
 * - Crear nuevos conjuntos
 * - Editar conjuntos
 * - Ver pronóstico jerárquico
 */

import React, { useState, useEffect } from 'react';
import {
  listConjuntos,
  createConjunto,
  deleteConjunto,
  getConjunto,
  type Conjunto,
  type ConjuntoCreate,
  type ConjuntoDetalleResponse
} from '../../services/conjuntosService';

// =====================================================================================
// COMPONENTE PRINCIPAL
// =====================================================================================

const ConjuntosAdmin: React.FC = () => {
  const [conjuntos, setConjuntos] = useState<Conjunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [filtroActivo, setFiltroActivo] = useState<boolean | undefined>(true);

  // Modal de crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editingConjunto, setEditingConjunto] = useState<Conjunto | null>(null);

  // Modal de detalle
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleConjunto, setDetalleConjunto] = useState<ConjuntoDetalleResponse | null>(null);

  // =====================================================================================
  // EFECTOS
  // =====================================================================================

  useEffect(() => {
    loadConjuntos();
  }, [filtroCategoria, filtroActivo]);

  // =====================================================================================
  // FUNCIONES DE CARGA
  // =====================================================================================

  const loadConjuntos = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (filtroActivo !== undefined) params.activo = filtroActivo;
      if (filtroCategoria) params.categoria = filtroCategoria;

      const response = await listConjuntos(params);
      setConjuntos(response.conjuntos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar conjuntos');
      console.error('Error cargando conjuntos:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetalleConjunto = async (conjuntoId: string) => {
    try {
      const detalle = await getConjunto(conjuntoId);
      setDetalleConjunto(detalle);
      setShowDetalle(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar detalle');
      console.error('Error cargando detalle:', err);
    }
  };

  // =====================================================================================
  // FUNCIONES DE ACCIONES
  // =====================================================================================

  const handleCrear = () => {
    setEditingConjunto(null);
    setShowModal(true);
  };

  const handleEditar = (conjunto: Conjunto) => {
    setEditingConjunto(conjunto);
    setShowModal(true);
  };

  const handleEliminar = async (conjuntoId: string) => {
    if (!confirm('¿Estás seguro de que deseas desactivar este conjunto?')) return;

    try {
      await deleteConjunto(conjuntoId);
      await loadConjuntos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar conjunto');
    }
  };

  const handleVerDetalle = (conjuntoId: string) => {
    loadDetalleConjunto(conjuntoId);
  };

  // =====================================================================================
  // CATEGORÍAS ÚNICAS
  // =====================================================================================

  const categoriasUnicas = Array.from(new Set(
    conjuntos.map(c => c.categoria).filter(Boolean)
  )).sort();

  // =====================================================================================
  // RENDER
  // =====================================================================================

  if (loading && conjuntos.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Conjuntos Sustituibles
        </h1>
        <p className="text-gray-600">
          Gestiona grupos de productos intercambiables para optimizar el pronóstico de demanda
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <div className="flex items-center">
            <span className="text-xl mr-2">⚠️</span>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-700 hover:text-red-900"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          {/* Filtros */}
          <div className="flex flex-wrap gap-4 items-center">
            {/* Filtro por estado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                value={filtroActivo === undefined ? 'todos' : filtroActivo ? 'activos' : 'inactivos'}
                onChange={(e) => {
                  const val = e.target.value;
                  setFiltroActivo(val === 'todos' ? undefined : val === 'activos');
                }}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="todos">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </div>

            {/* Filtro por categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría
              </label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas</option>
                {categoriasUnicas.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Contador */}
            <div className="text-sm text-gray-600">
              {conjuntos.length} conjunto{conjuntos.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Botón crear */}
          <button
            onClick={handleCrear}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors duration-200 flex items-center gap-2"
          >
            <span>+</span>
            <span>Crear Conjunto</span>
          </button>
        </div>
      </div>

      {/* Lista de Conjuntos */}
      {conjuntos.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            No hay conjuntos
          </h3>
          <p className="text-gray-500 mb-6">
            Crea tu primer conjunto de productos sustituibles
          </p>
          <button
            onClick={handleCrear}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium"
          >
            Crear Primer Conjunto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conjuntos.map(conjunto => (
            <ConjuntoCard
              key={conjunto.id}
              conjunto={conjunto}
              onEditar={handleEditar}
              onEliminar={handleEliminar}
              onVerDetalle={handleVerDetalle}
            />
          ))}
        </div>
      )}

      {/* Modal de Crear/Editar */}
      {showModal && (
        <ModalCrearConjunto
          conjunto={editingConjunto}
          onClose={() => {
            setShowModal(false);
            setEditingConjunto(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingConjunto(null);
            loadConjuntos();
          }}
        />
      )}

      {/* Modal de Detalle */}
      {showDetalle && detalleConjunto && (
        <ModalDetalleConjunto
          detalle={detalleConjunto}
          onClose={() => {
            setShowDetalle(false);
            setDetalleConjunto(null);
          }}
          onUpdate={() => {
            loadConjuntos();
            if (detalleConjunto) {
              loadDetalleConjunto(detalleConjunto.conjunto.id);
            }
          }}
        />
      )}
    </div>
  );
};

// =====================================================================================
// COMPONENTE: TARJETA DE CONJUNTO
// =====================================================================================

interface ConjuntoCardProps {
  conjunto: Conjunto;
  onEditar: (conjunto: Conjunto) => void;
  onEliminar: (id: string) => void;
  onVerDetalle: (id: string) => void;
}

const ConjuntoCard: React.FC<ConjuntoCardProps> = ({
  conjunto,
  onEditar,
  onEliminar,
  onVerDetalle
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
      <div className="p-5">
        {/* Header con estado */}
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 flex-1">
            {conjunto.nombre}
          </h3>
          <span className={`px-2 py-1 text-xs rounded-full ${
            conjunto.activo
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {conjunto.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        {/* Descripción */}
        {conjunto.descripcion && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {conjunto.descripcion}
          </p>
        )}

        {/* Categoría */}
        {conjunto.categoria && (
          <div className="mb-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {conjunto.categoria}
            </span>
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-2 gap-3 mb-4 py-3 border-t border-b border-gray-100">
          <div>
            <div className="text-xs text-gray-500">Productos</div>
            <div className="text-lg font-semibold text-gray-900">
              {conjunto.productos_activos || 0} / {conjunto.total_productos || 0}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Demanda/día</div>
            <div className="text-lg font-semibold text-gray-900">
              {conjunto.demanda_diaria_total
                ? Math.round(Number(conjunto.demanda_diaria_total))
                : '-'}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <button
            onClick={() => onVerDetalle(conjunto.id)}
            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded text-sm font-medium transition-colors duration-200"
          >
            Ver Detalle
          </button>
          <button
            onClick={() => onEditar(conjunto)}
            className="bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm font-medium transition-colors duration-200"
          >
            Editar
          </button>
          <button
            onClick={() => onEliminar(conjunto.id)}
            className="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded text-sm font-medium transition-colors duration-200"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================================
// COMPONENTE: MODAL DE CREAR/EDITAR
// =====================================================================================

interface ModalCrearConjuntoProps {
  conjunto: Conjunto | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ModalCrearConjunto: React.FC<ModalCrearConjuntoProps> = ({
  conjunto,
  onClose,
  onSuccess
}) => {
  const [formData, setFormData] = useState<ConjuntoCreate>({
    nombre: conjunto?.nombre || '',
    descripcion: conjunto?.descripcion || '',
    categoria: conjunto?.categoria || '',
    activo: conjunto?.activo ?? true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await createConjunto(formData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      console.error('Error guardando conjunto:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {conjunto ? 'Editar Conjunto' : 'Crear Conjunto'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          {/* Nombre */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Ej: Azúcar Blanca 1kg"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Descripción */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción
            </label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción del conjunto..."
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Categoría */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categoría
            </label>
            <input
              type="text"
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              placeholder="Ej: Alimentos > Granos"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Activo */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.activo}
                onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Conjunto activo</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 font-medium"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =====================================================================================
// COMPONENTE: MODAL DE DETALLE (Placeholder)
// =====================================================================================

interface ModalDetalleConjuntoProps {
  detalle: ConjuntoDetalleResponse;
  onClose: () => void;
  onUpdate: () => void;
}

const ModalDetalleConjunto: React.FC<ModalDetalleConjuntoProps> = ({
  detalle,
  onClose
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {detalle.conjunto.nombre}
            </h2>
            {detalle.conjunto.descripcion && (
              <p className="text-sm text-gray-600 mt-1">
                {detalle.conjunto.descripcion}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 mb-3">
            Productos ({detalle.productos.length})
          </h3>

          {detalle.productos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No hay productos en este conjunto
            </div>
          ) : (
            <div className="space-y-2">
              {detalle.productos.map(producto => (
                <div
                  key={producto.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {producto.descripcion || producto.codigo_producto}
                      </div>
                      <div className="text-sm text-gray-600">
                        {producto.codigo_producto}
                        {producto.marca && ` • ${producto.marca}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-blue-600">
                        {producto.share_manual ? Number(producto.share_manual).toFixed(1) : '0.0'}%
                      </div>
                      <div className="text-xs text-gray-500">Share</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6">
          <button
            onClick={onClose}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConjuntosAdmin;
