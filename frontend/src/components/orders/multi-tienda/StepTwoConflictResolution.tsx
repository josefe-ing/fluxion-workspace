/**
 * Paso 2: Resolución de Conflictos DPD+U
 *
 * Muestra TODOS los productos con conflicto en una sola tabla.
 * Incluye filtros y ordenamiento similar al wizard de una sola tienda.
 */

import { useState, useMemo } from 'react';
import { X, Package, TrendingDown, Store, Info } from 'lucide-react';
import ProductHistoryModal from '../../dashboard/ProductHistoryModal';
import ProductSalesModal from '../../sales/ProductSalesModal';
import { TransitoModal } from './TransitoModal';
import type {
  OrderDataMultiTienda,
  CalcularMultiTiendaResponse,
  ConflictoProducto,
  AsignacionTienda,
} from '../../../types/multitienda';

interface Props {
  orderData: OrderDataMultiTienda;
  calculationResult: CalcularMultiTiendaResponse;
  updateOrderData: (data: Partial<OrderDataMultiTienda>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SortField = 'abc' | 'stock_cedi' | 'necesidad' | 'producto';
type SortDirection = 'asc' | 'desc';

export default function StepTwoConflictResolution({
  orderData: _orderData,
  calculationResult,
  updateOrderData: _updateOrderData,
  onNext,
  onBack,
}: Props) {
  const conflictos = calculationResult.conflictos || [];
  const configDpdu = calculationResult.config_dpdu;
  const tiendas = calculationResult.pedidos_por_tienda?.map(p => ({
    id: p.tienda_id,
    nombre: p.tienda_nombre,
  })) || [];

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [filtroABC, setFiltroABC] = useState<string>('todos');
  const [filtroCediStock, setFiltroCediStock] = useState<'todos' | 'con_stock' | 'sin_stock'>('todos');
  const [sortField, setSortField] = useState<SortField>('abc');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estado para ajustes manuales: { [codigo_producto]: { [tienda_id]: bultos } }
  const [ajustesManuales, setAjustesManuales] = useState<Record<string, Record<string, number>>>({});

  // Estado para productos seleccionados (incluidos en el pedido)
  const [productosSeleccionados, setProductosSeleccionados] = useState<Set<string>>(() => {
    // Inicialmente todos seleccionados
    return new Set(conflictos.map(c => c.codigo_producto));
  });

  // Estados para modales
  const [stockCediModalOpen, setStockCediModalOpen] = useState(false);
  const [necesitanModalOpen, setNecesitanModalOpen] = useState(false);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [stockTiendaModalOpen, setStockTiendaModalOpen] = useState(false);
  const [transitoModalOpen, setTransitoModalOpen] = useState(false);
  const [selectedConflicto, setSelectedConflicto] = useState<ConflictoProducto | null>(null);
  const [selectedTiendaId, setSelectedTiendaId] = useState<string>('');
  const [selectedAsignacion, setSelectedAsignacion] = useState<AsignacionTienda | null>(null);

  // Estado para ajustes de tránsito: { [codigo_producto]: { [tienda_id]: bultos } }
  const [ajustesTransito, setAjustesTransito] = useState<Record<string, Record<string, number>>>({});

  // Handlers para abrir modales
  const handleOpenStockCediModal = (conflicto: ConflictoProducto) => {
    setSelectedConflicto(conflicto);
    setStockCediModalOpen(true);
  };

  const handleOpenNecesitanModal = (conflicto: ConflictoProducto) => {
    setSelectedConflicto(conflicto);
    setNecesitanModalOpen(true);
  };

  const handleOpenSalesModal = (conflicto: ConflictoProducto, tiendaId: string) => {
    setSelectedConflicto(conflicto);
    setSelectedTiendaId(tiendaId);
    setSalesModalOpen(true);
  };

  const handleOpenStockTiendaModal = (conflicto: ConflictoProducto, tiendaId: string) => {
    setSelectedConflicto(conflicto);
    setSelectedTiendaId(tiendaId);
    setStockTiendaModalOpen(true);
  };

  const handleOpenTransitoModal = (conflicto: ConflictoProducto, asignacion: AsignacionTienda) => {
    setSelectedConflicto(conflicto);
    setSelectedAsignacion(asignacion);
    setSelectedTiendaId(asignacion.tienda_id);
    setTransitoModalOpen(true);
  };

  // Obtener valor de tránsito (override o valor del servidor)
  const getTransitoValue = (codigoProducto: string, tiendaId: string, valorServidor: number): number => {
    return ajustesTransito[codigoProducto]?.[tiendaId] ?? valorServidor;
  };

  // Manejar cambio de tránsito
  const handleTransitoChange = (codigoProducto: string, tiendaId: string, valor: number) => {
    setAjustesTransito(prev => ({
      ...prev,
      [codigoProducto]: {
        ...prev[codigoProducto],
        [tiendaId]: Math.max(0, valor),
      },
    }));
  };

  // Calcular días efectivos considerando tránsito
  const calcularDiasEfectivos = (stockActual: number, transitoBultos: number, demandaP75: number, unidadesPorBulto: number): number => {
    if (demandaP75 <= 0) return 999;
    const stockEfectivo = stockActual + (transitoBultos * unidadesPorBulto);
    return stockEfectivo / demandaP75;
  };

  // Calcular SUG efectivo considerando tránsito (stock_maximo - (stock + transito))
  const calcularSugEfectivo = (asignacion: AsignacionTienda, transitoBultos: number, unidadesPorBulto: number): number => {
    // cantidad_necesaria ya está en unidades, la usamos directamente pero restamos el tránsito
    const transitoUnidades = transitoBultos * unidadesPorBulto;
    const necesidadAjustada = Math.max(0, asignacion.cantidad_necesaria - transitoUnidades);
    return Math.ceil(necesidadAjustada / unidadesPorBulto);
  };

  // Obtener categorías únicas
  const categorias = useMemo(() => {
    const cats = new Set(conflictos.map(c => c.categoria || 'Sin categoría'));
    return ['todas', ...Array.from(cats).sort()];
  }, [conflictos]);

  // Filtrar conflictos
  const conflictosFiltrados = useMemo(() => {
    let resultado = [...conflictos];

    // Filtro de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      resultado = resultado.filter(c =>
        c.codigo_producto.toLowerCase().includes(term) ||
        c.descripcion_producto.toLowerCase().includes(term)
      );
    }

    // Filtro de categoría
    if (filtroCategoria !== 'todas') {
      resultado = resultado.filter(c => (c.categoria || 'Sin categoría') === filtroCategoria);
    }

    // Filtro ABC
    if (filtroABC !== 'todos') {
      resultado = resultado.filter(c => c.clasificacion_abc === filtroABC);
    }

    // Filtro de stock CEDI
    if (filtroCediStock !== 'todos') {
      resultado = resultado.filter(c => {
        if (filtroCediStock === 'con_stock') return c.stock_cedi_bultos > 0;
        if (filtroCediStock === 'sin_stock') return c.stock_cedi_bultos === 0;
        return true;
      });
    }

    // Ordenamiento
    resultado.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'abc': {
          const abcOrder: Record<string, number> = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
          const aOrder = abcOrder[a.clasificacion_abc || ''] || 99;
          const bOrder = abcOrder[b.clasificacion_abc || ''] || 99;
          comparison = aOrder - bOrder;
          break;
        }
        case 'stock_cedi':
          comparison = a.stock_cedi_bultos - b.stock_cedi_bultos;
          break;
        case 'necesidad':
          comparison = Math.ceil(a.necesidad_total_tiendas / a.unidades_por_bulto) - Math.ceil(b.necesidad_total_tiendas / b.unidades_por_bulto);
          break;
        case 'producto':
          comparison = a.descripcion_producto.localeCompare(b.descripcion_producto);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return resultado;
  }, [conflictos, searchTerm, filtroCategoria, filtroABC, filtroCediStock, sortField, sortDirection]);

  // Contadores para filtros
  const contadores = useMemo(() => {
    const porABC: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    const porCategoria: Record<string, number> = {};

    conflictos.forEach(c => {
      if (c.clasificacion_abc) {
        porABC[c.clasificacion_abc] = (porABC[c.clasificacion_abc] || 0) + 1;
      }
      const cat = c.categoria || 'Sin categoría';
      porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    });

    return { porABC, porCategoria };
  }, [conflictos]);

  // Formatear número
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('es-VE').format(Math.round(num));
  };

  // Obtener valor final (manual o DPD+U)
  const getValorFinal = (codigoProducto: string, tiendaId: string, valorDpdu: number): number => {
    return ajustesManuales[codigoProducto]?.[tiendaId] ?? valorDpdu;
  };

  // Manejar cambio manual
  const handleCambioManual = (codigoProducto: string, tiendaId: string, valor: number) => {
    setAjustesManuales(prev => ({
      ...prev,
      [codigoProducto]: {
        ...prev[codigoProducto],
        [tiendaId]: Math.max(0, valor),
      },
    }));
  };

  // Calcular totales por producto
  const getTotalAsignado = (conflicto: ConflictoProducto): number => {
    return conflicto.distribucion_dpdu.reduce((sum, asig) => {
      const valor = getValorFinal(conflicto.codigo_producto, asig.tienda_id, asig.cantidad_asignada_bultos);
      return sum + valor;
    }, 0);
  };

  // Verificar si excede stock
  const excedeStock = (conflicto: ConflictoProducto): boolean => {
    const totalAsignado = getTotalAsignado(conflicto);
    return totalAsignado > conflicto.stock_cedi_bultos;
  };

  // Color por días de stock
  const getDiasStockColor = (dias: number): string => {
    if (dias <= 0.5) return 'bg-red-100 text-red-700';
    if (dias <= 1) return 'bg-orange-100 text-orange-700';
    if (dias <= 2) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  // Toggle ordenamiento
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Resumen de cambios
  const resumenCambios = useMemo(() => {
    let productosModificados = 0;
    let erroresExceso = 0;

    conflictos.forEach(conflicto => {
      const tieneAjuste = conflicto.distribucion_dpdu.some(asig =>
        ajustesManuales[conflicto.codigo_producto]?.[asig.tienda_id] !== undefined
      );
      if (tieneAjuste) productosModificados++;
      if (excedeStock(conflicto)) erroresExceso++;
    });

    return { productosModificados, erroresExceso };
  }, [conflictos, ajustesManuales]);

  // Icono de ordenamiento
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-gray-700 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Handler para continuar al siguiente paso, propagando los ajustes manuales
  const handleContinue = () => {
    // Actualizar los pedidos_por_tienda con los valores ajustados de conflictos
    const pedidosActualizados = calculationResult.pedidos_por_tienda.map(pedido => {
      const productosActualizados = pedido.productos.map(producto => {
        // Buscar si este producto tiene un conflicto con ajuste manual
        const conflicto = conflictos.find(c => c.codigo_producto === producto.codigo_producto);
        if (conflicto) {
          // Verificar si hay ajuste manual para esta tienda
          const ajusteManual = ajustesManuales[producto.codigo_producto]?.[pedido.tienda_id];
          if (ajusteManual !== undefined) {
            // Usar el valor manual
            return {
              ...producto,
              cantidad_sugerida_bultos: ajusteManual,
              cantidad_sugerida_unid: ajusteManual * producto.unidades_por_bulto,
              ajustado_por_dpdu: true,
              cantidad_original_bultos: conflicto.distribucion_dpdu.find(a => a.tienda_id === pedido.tienda_id)?.cantidad_asignada_bultos,
            };
          } else {
            // Usar el valor DPD+U original del conflicto
            const asignacion = conflicto.distribucion_dpdu.find(a => a.tienda_id === pedido.tienda_id);
            if (asignacion) {
              return {
                ...producto,
                cantidad_sugerida_bultos: asignacion.cantidad_asignada_bultos,
                cantidad_sugerida_unid: asignacion.cantidad_asignada_bultos * producto.unidades_por_bulto,
                ajustado_por_dpdu: true,
              };
            }
          }
        }
        return producto;
      });

      // Recalcular totales
      const totalBultos = productosActualizados
        .filter(p => productosSeleccionados.has(p.codigo_producto))
        .reduce((sum, p) => sum + p.cantidad_sugerida_bultos, 0);
      const totalUnidades = productosActualizados
        .filter(p => productosSeleccionados.has(p.codigo_producto))
        .reduce((sum, p) => sum + p.cantidad_sugerida_unid, 0);

      return {
        ...pedido,
        productos: productosActualizados,
        total_bultos: totalBultos,
        total_unidades: totalUnidades,
      };
    });

    // Actualizar orderData con los pedidos ajustados
    _updateOrderData({
      pedidos_por_tienda: pedidosActualizados,
      conflictos: conflictos.map(c => ({
        ...c,
        distribucion_manual: c.distribucion_dpdu.map(asig => ({
          ...asig,
          cantidad_asignada_bultos: getValorFinal(c.codigo_producto, asig.tienda_id, asig.cantidad_asignada_bultos),
        })),
        resolucion_usuario: Object.keys(ajustesManuales[c.codigo_producto] || {}).length > 0 ? 'manual' : 'dpdu',
      })),
    });

    onNext();
  };

  // Toggle selección de un producto
  const toggleSeleccion = (codigoProducto: string) => {
    setProductosSeleccionados(prev => {
      const newSet = new Set(prev);
      if (newSet.has(codigoProducto)) {
        newSet.delete(codigoProducto);
      } else {
        newSet.add(codigoProducto);
      }
      return newSet;
    });
  };

  // Seleccionar/deseleccionar todos los visibles
  const toggleSeleccionarTodos = () => {
    const codigosVisibles = conflictosFiltrados.map(c => c.codigo_producto);
    const todosSeleccionados = codigosVisibles.every(c => productosSeleccionados.has(c));

    setProductosSeleccionados(prev => {
      const newSet = new Set(prev);
      if (todosSeleccionados) {
        // Deseleccionar todos los visibles
        codigosVisibles.forEach(c => newSet.delete(c));
      } else {
        // Seleccionar todos los visibles
        codigosVisibles.forEach(c => newSet.add(c));
      }
      return newSet;
    });
  };

  // Verificar si todos los visibles están seleccionados
  const todosVisiblesSeleccionados = useMemo(() => {
    return conflictosFiltrados.length > 0 &&
      conflictosFiltrados.every(c => productosSeleccionados.has(c.codigo_producto));
  }, [conflictosFiltrados, productosSeleccionados]);

  // Algunos visibles seleccionados (para estado indeterminado)
  const algunosVisiblesSeleccionados = useMemo(() => {
    const seleccionados = conflictosFiltrados.filter(c => productosSeleccionados.has(c.codigo_producto));
    return seleccionados.length > 0 && seleccionados.length < conflictosFiltrados.length;
  }, [conflictosFiltrados, productosSeleccionados]);

  // Contar productos seleccionados que están visibles (después de filtros)
  const productosVisiblesSeleccionados = useMemo(() => {
    return conflictosFiltrados.filter(c => productosSeleccionados.has(c.codigo_producto)).length;
  }, [conflictosFiltrados, productosSeleccionados]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Resolver Conflictos de Stock
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {conflictos.length} producto{conflictos.length !== 1 ? 's' : ''} con stock insuficiente.
                Revise la distribución sugerida y ajuste si es necesario.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <div className="text-gray-500">Algoritmo DPD+U</div>
                <div className="font-medium">
                  Demanda {(configDpdu.peso_demanda * 100).toFixed(0)}% +
                  Urgencia {(configDpdu.peso_urgencia * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-3">
            {/* Búsqueda */}
            <div className="flex items-center gap-1">
              <span className="text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>

            {/* Filtro Categoría */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Cat:</label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="todas">Todas ({conflictos.length})</option>
                {categorias.filter(c => c !== 'todas').map(cat => (
                  <option key={cat} value={cat}>
                    {cat.length > 15 ? cat.slice(0, 15) + '...' : cat} ({contadores.porCategoria[cat] || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro ABC */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">ABC:</label>
              <select
                value={filtroABC}
                onChange={(e) => setFiltroABC(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="todos">Todos ({conflictos.length})</option>
                <option value="A">A ({contadores.porABC.A})</option>
                <option value="B">B ({contadores.porABC.B})</option>
                <option value="C">C ({contadores.porABC.C})</option>
                <option value="D">D ({contadores.porABC.D})</option>
              </select>
            </div>

            {/* Filtro Stock CEDI */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">CEDI:</label>
              <select
                value={filtroCediStock}
                onChange={(e) => setFiltroCediStock(e.target.value as 'todos' | 'con_stock' | 'sin_stock')}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="todos">Todos ({conflictos.length})</option>
                <option value="con_stock">Con stock ({conflictos.filter(c => c.stock_cedi_bultos > 0).length})</option>
                <option value="sin_stock">Sin stock ({conflictos.filter(c => c.stock_cedi_bultos === 0).length})</option>
              </select>
            </div>

            {/* Ordenar por */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Ordenar:</label>
              <select
                value={sortField}
                onChange={(e) => handleSort(e.target.value as SortField)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="abc">ABC (Clasificación)</option>
                <option value="stock_cedi">Stock CEDI</option>
                <option value="necesidad">Necesidad Total</option>
                <option value="producto">Producto (A-Z)</option>
              </select>
              <button
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50"
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            {/* Contador de resultados */}
            {conflictosFiltrados.length !== conflictos.length && (
              <div className="text-xs text-gray-500 ml-auto">
                Mostrando {conflictosFiltrados.length}/{conflictos.length}
              </div>
            )}
          </div>

          {/* Resumen de selección por ABC */}
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-4 text-xs">
            <span className="text-gray-500">Conflictos por ABC:</span>
            {contadores.porABC.A > 0 && (
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                A: {contadores.porABC.A}
              </span>
            )}
            {contadores.porABC.B > 0 && (
              <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-medium">
                B: {contadores.porABC.B}
              </span>
            )}
            {contadores.porABC.C > 0 && (
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                C: {contadores.porABC.C}
              </span>
            )}
            {contadores.porABC.D > 0 && (
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">
                D: {contadores.porABC.D}
              </span>
            )}
          </div>
        </div>

        {/* Tabla de conflictos */}
        <div className="overflow-x-auto max-h-[calc(100vh-400px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {/* Checkbox seleccionar todos */}
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 z-20" style={{ position: 'sticky', width: '40px', minWidth: '40px', left: 0 }}>
                  <input
                    type="checkbox"
                    checked={todosVisiblesSeleccionados}
                    ref={(el) => {
                      if (el) el.indeterminate = algunosVisiblesSeleccionados;
                    }}
                    onChange={toggleSeleccionarTodos}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    title={todosVisiblesSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  />
                </th>
                {/* Número consecutivo */}
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 z-20" style={{ position: 'sticky', width: '40px', minWidth: '40px', left: '40px' }}>
                  #
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 z-20 cursor-pointer hover:bg-gray-100"
                  style={{ position: 'sticky', minWidth: '220px', left: '80px' }}
                  onClick={() => handleSort('producto')}
                >
                  Producto <SortIcon field="producto" />
                </th>
                <th
                  className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('abc')}
                  style={{ width: '60px' }}
                >
                  ABC <SortIcon field="abc" />
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('stock_cedi')}
                >
                  Stock CEDI <SortIcon field="stock_cedi" />
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('necesidad')}
                >
                  Necesitan <SortIcon field="necesidad" />
                </th>
                {tiendas.map(tienda => (
                  <th
                    key={tienda.id}
                    className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    colSpan={8}
                  >
                    <div className="border-b border-gray-300 pb-1 mb-1">{tienda.nombre}</div>
                    <div className="flex justify-around text-[10px] font-normal normal-case">
                      <span>P75</span>
                      <span>Stk</span>
                      <span className="text-orange-600 font-medium">Trán</span>
                      <span>TOT</span>
                      <span>Días</span>
                      <span>SUG</span>
                      <span>DPD+U</span>
                      <span>Final</span>
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {conflictosFiltrados.map((conflicto, idx) => {
                const totalAsignado = getTotalAsignado(conflicto);
                const excede = excedeStock(conflicto);
                const estaSeleccionado = productosSeleccionados.has(conflicto.codigo_producto);
                // Color de fondo para las celdas sticky
                const rowBgColor = excede ? '#fef2f2' : (idx % 2 === 0 ? '#ffffff' : '#f9fafb');

                return (
                  <tr
                    key={conflicto.codigo_producto}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${excede ? 'bg-red-50' : ''} ${!estaSeleccionado ? 'opacity-50' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-3 text-center z-10" style={{ position: 'sticky', left: 0, minWidth: '40px', backgroundColor: rowBgColor }}>
                      <input
                        type="checkbox"
                        checked={estaSeleccionado}
                        onChange={() => toggleSeleccion(conflicto.codigo_producto)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                    </td>
                    {/* Número consecutivo */}
                    <td className="px-2 py-3 text-center text-sm text-gray-500 z-10" style={{ position: 'sticky', left: '40px', minWidth: '40px', backgroundColor: rowBgColor }}>
                      {idx + 1}
                    </td>
                    {/* Producto */}
                    <td className="px-4 py-3 z-10" style={{ position: 'sticky', left: '80px', minWidth: '220px', backgroundColor: rowBgColor }}>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {conflicto.descripcion_producto}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">{conflicto.codigo_producto}</span>
                          <span className="text-[10px] text-gray-400">
                            {conflicto.unidades_por_bulto} u/blt
                          </span>
                        </div>
                        {conflicto.categoria && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[180px]">
                            {conflicto.categoria}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ABC */}
                    <td className="px-3 py-3 text-center">
                      {conflicto.clasificacion_abc && (
                        <span className={`px-2 py-1 text-xs font-bold rounded ${
                          conflicto.clasificacion_abc === 'A' ? 'bg-green-100 text-green-700' :
                          conflicto.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-700' :
                          conflicto.clasificacion_abc === 'C' ? 'bg-gray-100 text-gray-600' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {conflicto.clasificacion_abc}
                        </span>
                      )}
                    </td>

                    {/* Stock CEDI - Clickeable para ver histórico */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleOpenStockCediModal(conflicto)}
                        className="hover:bg-green-50 rounded px-2 py-1 transition-colors cursor-pointer w-full"
                        title="Ver histórico de inventario en CEDI"
                      >
                        <div className="text-sm font-bold text-green-700">
                          {conflicto.stock_cedi_bultos.toFixed(1).replace('.', ',')}
                        </div>
                        <div className="text-xs text-green-500">
                          {formatNumber(conflicto.stock_cedi_disponible)}u
                        </div>
                      </button>
                    </td>

                    {/* Necesitan - Clickeable para ver desglose */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleOpenNecesitanModal(conflicto)}
                        className="hover:bg-red-50 rounded px-2 py-1 transition-colors cursor-pointer"
                        title="Ver desglose de necesidad por tienda"
                      >
                        <div className="text-sm font-medium text-red-600">
                          {Math.ceil(conflicto.necesidad_total_tiendas / conflicto.unidades_por_bulto)} blt
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatNumber(conflicto.necesidad_total_tiendas)} uds
                        </div>
                      </button>
                    </td>

                    {/* Por cada tienda: P75 | Stk | Trán | TOT | Días | SUG | DPD+U | Final */}
                    {tiendas.map(tienda => {
                      const asignacion = conflicto.distribucion_dpdu.find(a => a.tienda_id === tienda.id);
                      if (!asignacion) return <td key={tienda.id} colSpan={8}></td>;

                      const valorDpdu = asignacion.cantidad_asignada_bultos;
                      const valorFinal = getValorFinal(conflicto.codigo_producto, tienda.id, valorDpdu);
                      const fueModificado = ajustesManuales[conflicto.codigo_producto]?.[tienda.id] !== undefined;

                      // Tránsito: usar override o valor del servidor
                      const transitoServidor = asignacion.transito_bultos || 0;
                      const transitoEfectivo = getTransitoValue(conflicto.codigo_producto, tienda.id, transitoServidor);
                      const transitoFueModificado = ajustesTransito[conflicto.codigo_producto]?.[tienda.id] !== undefined;
                      const tieneTransito = transitoServidor > 0 || transitoEfectivo > 0;

                      // Días efectivos considerando tránsito
                      const diasEfectivos = calcularDiasEfectivos(
                        asignacion.stock_actual,
                        transitoEfectivo,
                        asignacion.demanda_p75,
                        conflicto.unidades_por_bulto
                      );

                      // SUG: cantidad que necesita la tienda (ajustada por tránsito)
                      const sugBultos = calcularSugEfectivo(asignacion, transitoEfectivo, conflicto.unidades_por_bulto);
                      const sugOriginal = Math.ceil(asignacion.cantidad_necesaria / conflicto.unidades_por_bulto);

                      return (
                        <td key={tienda.id} colSpan={8} className="px-1 py-3">
                          <div className="flex items-center justify-around gap-1">
                            {/* P75 - bultos y unidades - Clickeable para ver ventas */}
                            <button
                              onClick={() => handleOpenSalesModal(conflicto, tienda.id)}
                              className="text-center w-12 hover:bg-purple-50 rounded px-1 py-0.5 transition-colors cursor-pointer"
                              title="Ver análisis de ventas"
                            >
                              <div className="text-xs font-medium text-purple-600">
                                {(asignacion.demanda_p75 / conflicto.unidades_por_bulto).toFixed(1)}
                              </div>
                              <div className="text-[10px] text-purple-400">
                                {asignacion.demanda_p75.toFixed(2).replace('.', ',')}u
                              </div>
                            </button>

                            {/* Stock tienda - bultos y unidades - Clickeable para ver histórico */}
                            <button
                              onClick={() => handleOpenStockTiendaModal(conflicto, tienda.id)}
                              className="text-center w-12 hover:bg-gray-100 rounded px-1 py-0.5 transition-colors cursor-pointer"
                              title="Ver histórico de inventario"
                            >
                              <div className="text-xs font-medium text-gray-700">
                                {(asignacion.stock_actual / conflicto.unidades_por_bulto).toFixed(1).replace('.', ',')}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {formatNumber(asignacion.stock_actual)}u
                              </div>
                            </button>

                            {/* Tránsito - Editable, clickeable para ver desglose */}
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={transitoEfectivo}
                                onChange={(e) => handleTransitoChange(
                                  conflicto.codigo_producto,
                                  tienda.id,
                                  parseFloat(e.target.value) || 0
                                )}
                                onClick={(e) => {
                                  // Solo abrir modal si tiene desglose
                                  if (asignacion.transito_desglose && asignacion.transito_desglose.length > 0) {
                                    e.stopPropagation();
                                    handleOpenTransitoModal(conflicto, asignacion);
                                  }
                                }}
                                className={`w-10 px-0.5 py-0 text-xs text-center border rounded focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                                  transitoFueModificado
                                    ? 'border-orange-400 bg-orange-50 font-medium'
                                    : tieneTransito
                                      ? 'border-orange-300 bg-orange-50 text-orange-700 cursor-pointer'
                                      : 'border-gray-200 bg-gray-50 text-gray-400'
                                }`}
                                title={tieneTransito ? 'Click para ver desglose de tránsito' : 'Sin productos en tránsito'}
                              />
                              {tieneTransito && asignacion.transito_desglose && asignacion.transito_desglose.length > 0 && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" title="Tiene desglose" />
                              )}
                            </div>

                            {/* TOT - Total (Stock + Tránsito) */}
                            <div className="text-center w-10" title="Stock total efectivo (Stock + Tránsito)">
                              <div className="text-xs font-medium text-gray-700">
                                {((asignacion.stock_actual + (transitoEfectivo * conflicto.unidades_por_bulto)) / conflicto.unidades_por_bulto).toFixed(1).replace('.', ',')}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {formatNumber(asignacion.stock_actual + (transitoEfectivo * conflicto.unidades_por_bulto))}u
                              </div>
                            </div>

                            {/* Días stock - Ahora usa días efectivos (stock + tránsito) */}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getDiasStockColor(diasEfectivos)}`}
                              title={transitoEfectivo > 0
                                ? `Días con tránsito: ${diasEfectivos.toFixed(1)} (sin tránsito: ${asignacion.dias_stock.toFixed(1)})`
                                : `Días de stock: ${diasEfectivos.toFixed(1)}`}
                            >
                              {diasEfectivos < 999 ? `${diasEfectivos.toFixed(1)}` : '—'}
                            </span>

                            {/* SUG - Sugerido (ajustado por tránsito) */}
                            <div
                              className="text-center w-10"
                              title={transitoEfectivo > 0
                                ? `Sugerido ajustado: ${sugBultos} blt (original: ${sugOriginal} blt)`
                                : 'Cantidad sugerida para la tienda'}
                            >
                              <div className={`text-xs font-medium ${sugBultos < sugOriginal ? 'text-green-600' : 'text-red-600'}`}>
                                {sugBultos}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                ~{asignacion.demanda_p75 > 0
                                  ? Math.round((sugBultos * conflicto.unidades_por_bulto) / asignacion.demanda_p75)
                                  : 0}d
                              </div>
                            </div>

                            {/* DPD+U - Asignado por algoritmo */}
                            <div className="text-center w-10" title="Asignado por algoritmo DPD+U">
                              <div className="text-sm text-orange-600 font-medium">
                                {valorDpdu}
                              </div>
                              <div className="text-[10px] text-orange-400">
                                ~{asignacion.demanda_p75 > 0
                                  ? Math.round((valorDpdu * conflicto.unidades_por_bulto) / asignacion.demanda_p75)
                                  : 0}d
                              </div>
                            </div>

                            {/* Final - Input con días calculados */}
                            <div className="text-center w-12">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                max={conflicto.stock_cedi_bultos}
                                value={valorFinal}
                                onChange={(e) => handleCambioManual(
                                  conflicto.codigo_producto,
                                  tienda.id,
                                  parseFloat(e.target.value) || 0
                                )}
                                className={`w-full px-0.5 py-0.5 text-xs text-center border rounded focus:outline-none focus:ring-1 focus:ring-gray-900 ${
                                  fueModificado
                                    ? 'border-blue-400 bg-blue-50 font-medium'
                                    : 'border-gray-300'
                                }`}
                              />
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                ~{asignacion.demanda_p75 > 0
                                  ? Math.round((valorFinal * conflicto.unidades_por_bulto) / asignacion.demanda_p75)
                                  : 0}d
                              </div>
                            </div>
                          </div>
                        </td>
                      );
                    })}

                    {/* Total asignado */}
                    <td className="px-4 py-3 text-center">
                      <div className={`text-sm font-bold ${excede ? 'text-red-600' : 'text-gray-900'}`}>
                        {totalAsignado} blt
                      </div>
                      {excede && (
                        <div className="text-[10px] text-red-500">
                          Excede por {totalAsignado - conflicto.stock_cedi_bultos}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer con resumen */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-red-100 border border-red-200"></span>
                <span className="text-gray-600">Crítico (&lt;0.5d)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-orange-100 border border-orange-200"></span>
                <span className="text-gray-600">Urgente (&lt;1d)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200"></span>
                <span className="text-gray-600">Alerta (&lt;2d)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-green-100 border border-green-200"></span>
                <span className="text-gray-600">OK (&gt;2d)</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-600 font-medium">
                {productosVisiblesSeleccionados} seleccionado{productosVisiblesSeleccionados !== 1 ? 's' : ''} de {conflictosFiltrados.length}
              </span>
              {resumenCambios.productosModificados > 0 && (
                <span className="text-blue-600">
                  {resumenCambios.productosModificados} modificado{resumenCambios.productosModificados !== 1 ? 's' : ''}
                </span>
              )}
              {resumenCambios.erroresExceso > 0 && (
                <span className="text-red-600 font-medium">
                  {resumenCambios.erroresExceso} excede{resumenCambios.erroresExceso !== 1 ? 'n' : ''} stock
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Botones de navegación */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
        >
          ← Volver
        </button>
        <button
          onClick={handleContinue}
          disabled={resumenCambios.erroresExceso > 0}
          className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Continuar →
        </button>
      </div>

      {/* Modal de Histórico de Stock CEDI */}
      {selectedConflicto && (
        <ProductHistoryModal
          isOpen={stockCediModalOpen}
          onClose={() => setStockCediModalOpen(false)}
          codigoProducto={selectedConflicto.codigo_producto}
          descripcionProducto={selectedConflicto.descripcion_producto}
          ubicacionId={calculationResult.cedi_origen}
        />
      )}

      {/* Modal de Análisis de Ventas (P75) */}
      {selectedConflicto && (
        <ProductSalesModal
          isOpen={salesModalOpen}
          onClose={() => setSalesModalOpen(false)}
          codigoProducto={selectedConflicto.codigo_producto}
          descripcionProducto={selectedConflicto.descripcion_producto}
          currentUbicacionId={selectedTiendaId}
        />
      )}

      {/* Modal de Histórico de Stock Tienda */}
      {selectedConflicto && selectedTiendaId && (
        <ProductHistoryModal
          isOpen={stockTiendaModalOpen}
          onClose={() => setStockTiendaModalOpen(false)}
          codigoProducto={selectedConflicto.codigo_producto}
          descripcionProducto={selectedConflicto.descripcion_producto}
          ubicacionId={selectedTiendaId}
        />
      )}

      {/* Modal de Tránsito */}
      {selectedConflicto && selectedAsignacion && (
        <TransitoModal
          isOpen={transitoModalOpen}
          onClose={() => setTransitoModalOpen(false)}
          codigoProducto={selectedConflicto.codigo_producto}
          descripcionProducto={selectedConflicto.descripcion_producto}
          tiendaNombre={tiendas.find(t => t.id === selectedAsignacion.tienda_id)?.nombre || selectedAsignacion.tienda_id}
          transitoBultos={getTransitoValue(selectedConflicto.codigo_producto, selectedAsignacion.tienda_id, selectedAsignacion.transito_bultos || 0)}
          desglose={selectedAsignacion.transito_desglose || []}
          unidadesPorBulto={selectedConflicto.unidades_por_bulto}
        />
      )}

      {/* Modal de Desglose de Necesidad */}
      {necesitanModalOpen && selectedConflicto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-red-50 to-orange-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Desglose de Necesidad
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedConflicto.descripcion_producto}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setNecesitanModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="p-6 space-y-6">
              {/* Info del producto */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <Package className="h-8 w-8 text-gray-400" />
                <div>
                  <div className="font-medium text-gray-900">{selectedConflicto.codigo_producto}</div>
                  <div className="text-sm text-gray-500">
                    {selectedConflicto.unidades_por_bulto} unidades por bulto •
                    Clasificación {selectedConflicto.clasificacion_abc}
                  </div>
                </div>
              </div>

              {/* Resumen Total */}
              <div className="p-4 bg-gradient-to-r from-red-100 to-orange-100 rounded-lg border border-red-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-red-600" />
                    <span className="font-medium text-red-800">Necesidad Total</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-700">
                      {Math.ceil(selectedConflicto.necesidad_total_tiendas / selectedConflicto.unidades_por_bulto)} bultos
                    </div>
                    <div className="text-sm text-red-600">
                      {formatNumber(selectedConflicto.necesidad_total_tiendas)} unidades
                    </div>
                  </div>
                </div>
              </div>

              {/* Desglose por tienda */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Necesidad por Tienda
                </h4>
                <div className="space-y-2">
                  {selectedConflicto.distribucion_dpdu.map(asignacion => {
                    const tienda = tiendas.find(t => t.id === asignacion.tienda_id);
                    const necesidadBultos = Math.ceil(asignacion.cantidad_necesaria / selectedConflicto.unidades_por_bulto);
                    const porcentaje = selectedConflicto.necesidad_total_tiendas > 0
                      ? (asignacion.cantidad_necesaria / selectedConflicto.necesidad_total_tiendas * 100)
                      : 0;

                    return (
                      <div
                        key={asignacion.tienda_id}
                        className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Store className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {tienda?.nombre || asignacion.tienda_id}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <span>Stock: {formatNumber(asignacion.stock_actual)}u</span>
                              <span>•</span>
                              <span>P75: {asignacion.demanda_p75.toFixed(1)}u/día</span>
                              <span>•</span>
                              <span className={`font-medium ${
                                asignacion.dias_stock <= 0.5 ? 'text-red-600' :
                                asignacion.dias_stock <= 1 ? 'text-orange-600' :
                                asignacion.dias_stock <= 2 ? 'text-yellow-600' : 'text-green-600'
                              }`}>
                                {asignacion.dias_stock.toFixed(1)} días
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-red-600">
                            {necesidadBultos} blt
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatNumber(asignacion.cantidad_necesaria)}u ({porcentaje.toFixed(0)}%)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Verificación de suma */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700 font-medium">
                    Suma de necesidades por tienda:
                  </span>
                  <span className="font-bold text-blue-800">
                    {selectedConflicto.distribucion_dpdu.reduce((sum, a) =>
                      sum + Math.ceil(a.cantidad_necesaria / selectedConflicto.unidades_por_bulto), 0
                    )} bultos = {formatNumber(
                      selectedConflicto.distribucion_dpdu.reduce((sum, a) => sum + a.cantidad_necesaria, 0)
                    )} unidades
                  </span>
                </div>
              </div>

              {/* Stock disponible vs necesidad */}
              <div className={`p-4 rounded-lg border ${
                selectedConflicto.stock_cedi_bultos >= Math.ceil(selectedConflicto.necesidad_total_tiendas / selectedConflicto.unidades_por_bulto)
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Stock CEDI disponible</div>
                    <div className="text-sm text-gray-600">
                      {selectedConflicto.stock_cedi_bultos} bultos ({formatNumber(selectedConflicto.stock_cedi_disponible)} uds)
                    </div>
                  </div>
                  <div className="text-right">
                    {selectedConflicto.stock_cedi_bultos >= Math.ceil(selectedConflicto.necesidad_total_tiendas / selectedConflicto.unidades_por_bulto) ? (
                      <span className="text-green-700 font-medium">✓ Suficiente</span>
                    ) : (
                      <div>
                        <span className="text-red-700 font-medium">✗ Insuficiente</span>
                        <div className="text-xs text-red-600">
                          Faltan {Math.ceil(selectedConflicto.necesidad_total_tiendas / selectedConflicto.unidades_por_bulto) - selectedConflicto.stock_cedi_bultos} bultos
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setNecesitanModalOpen(false)}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
