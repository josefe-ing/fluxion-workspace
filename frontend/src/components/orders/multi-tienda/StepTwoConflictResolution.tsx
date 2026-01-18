/**
 * Paso 2: Resolución de Conflictos DPD+U
 *
 * Muestra TODOS los productos con conflicto en una sola tabla.
 * Incluye filtros y ordenamiento similar al wizard de una sola tienda.
 */

import { useState, useMemo } from 'react';
import type {
  OrderDataMultiTienda,
  CalcularMultiTiendaResponse,
  ConflictoProducto,
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
                    colSpan={5}
                  >
                    <div className="border-b border-gray-300 pb-1 mb-1">{tienda.nombre}</div>
                    <div className="flex justify-around text-[10px] font-normal normal-case">
                      <span>P75</span>
                      <span>Stk</span>
                      <span>Días</span>
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

                    {/* Stock CEDI */}
                    <td className="px-4 py-3 text-center">
                      <div className="text-sm font-bold text-gray-900">
                        {conflicto.stock_cedi_bultos} blt
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatNumber(conflicto.stock_cedi_disponible)} uds
                      </div>
                    </td>

                    {/* Necesitan */}
                    <td className="px-4 py-3 text-center">
                      <div className="text-sm font-medium text-red-600">
                        {Math.ceil(conflicto.necesidad_total_tiendas / conflicto.unidades_por_bulto)} blt
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatNumber(conflicto.necesidad_total_tiendas)} uds
                      </div>
                    </td>

                    {/* Por cada tienda: P75 | Stk | Días | DPD+U | Final */}
                    {tiendas.map(tienda => {
                      const asignacion = conflicto.distribucion_dpdu.find(a => a.tienda_id === tienda.id);
                      if (!asignacion) return <td key={tienda.id} colSpan={5}></td>;

                      const valorDpdu = asignacion.cantidad_asignada_bultos;
                      const valorFinal = getValorFinal(conflicto.codigo_producto, tienda.id, valorDpdu);
                      const fueModificado = ajustesManuales[conflicto.codigo_producto]?.[tienda.id] !== undefined;

                      return (
                        <td key={tienda.id} colSpan={5} className="px-1 py-3">
                          <div className="flex items-center justify-around gap-1">
                            {/* P75 - bultos y unidades */}
                            <div className="text-center w-12" title="Venta diaria P75">
                              <div className="text-xs font-medium text-purple-600">
                                {(asignacion.demanda_p75 / conflicto.unidades_por_bulto).toFixed(1)}
                              </div>
                              <div className="text-[10px] text-purple-400">
                                {asignacion.demanda_p75.toFixed(2).replace('.', ',')}u
                              </div>
                            </div>

                            {/* Stock tienda - bultos y unidades */}
                            <div className="text-center w-12" title="Stock actual tienda">
                              <div className="text-xs font-medium text-gray-700">
                                {(asignacion.stock_actual / conflicto.unidades_por_bulto).toFixed(1).replace('.', ',')}
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {formatNumber(asignacion.stock_actual)}u
                              </div>
                            </div>

                            {/* Días stock */}
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getDiasStockColor(asignacion.dias_stock)}`}>
                              {asignacion.dias_stock < 999 ? `${asignacion.dias_stock.toFixed(1)}` : '—'}
                            </span>

                            {/* Sugerido DPD+U */}
                            <div className="text-center w-10" title="Sugerido por algoritmo DPD+U">
                              <div className="text-sm text-orange-600 font-medium">
                                {valorDpdu}
                              </div>
                              <div className="text-[10px] text-orange-400">
                                ~{asignacion.demanda_p75 > 0
                                  ? Math.round((valorDpdu * conflicto.unidades_por_bulto) / asignacion.demanda_p75)
                                  : 0}d
                              </div>
                            </div>

                            {/* Input Final */}
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
                              className={`w-16 px-1 py-1 text-sm text-center border rounded focus:outline-none focus:ring-1 focus:ring-gray-900 ${
                                fueModificado
                                  ? 'border-blue-400 bg-blue-50 font-medium'
                                  : 'border-gray-300'
                              }`}
                            />
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
                {productosSeleccionados.size} seleccionado{productosSeleccionados.size !== 1 ? 's' : ''} de {conflictos.length}
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
    </div>
  );
}
