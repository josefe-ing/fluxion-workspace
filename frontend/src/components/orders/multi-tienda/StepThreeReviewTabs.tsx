/**
 * Paso 3: Revisar Pedidos por Tienda (Tabs)
 *
 * Muestra tabs horizontales, uno por cada tienda seleccionada.
 * Estructura de columnas similar a OrderStepTwo del wizard de una sola tienda.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  OrderDataMultiTienda,
  CalcularMultiTiendaResponse,
  PedidoTienda,
  ProductoPedidoSimplificado,
} from '../../../types/multitienda';
import ProductSalesModal from '../../sales/ProductSalesModal';
import ProductHistoryModal from '../../dashboard/ProductHistoryModal';
import StockSeguridadModal from '../StockSeguridadModal';
import StockMinimoModal from '../StockMinimoModal';
import StockMaximoModal from '../StockMaximoModal';
import CriticidadModal from '../CriticidadModal';

interface Props {
  orderData: OrderDataMultiTienda;
  calculationResult: CalcularMultiTiendaResponse;
  updateOrderData: (data: Partial<OrderDataMultiTienda>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SortField = 'codigo' | 'descripcion' | 'abc' | 'stock' | 'dias' | 'p75' | 'cedi' | 'sugerido' | 'criticidad' | 'pedir';
type SortDirection = 'asc' | 'desc';

// Tipo para almacenar ediciones del usuario
interface ProductoEditado {
  cantidad_pedida_bultos: number;
  nota: string;
}

// Tipo para filtros por tienda
interface FiltrosTienda {
  searchTerm: string;
  filterAbc: string;
  filterCategoria: string;
  filterCuadrante: string;
  filterCedi: 'todos' | 'con_stock' | 'sin_stock';
  filterPrioridad: 'todas' | 'critico' | 'urgente' | 'optimo' | 'exceso';
  filterDiasStock: 'todos' | '0-1' | '1-2' | '2-4' | '4-5' | '5+';
  filterVista: 'todos' | 'seleccionados' | 'no_seleccionados';
  showOnlyAdjusted: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
}

// Filtros por defecto
const defaultFiltros: FiltrosTienda = {
  searchTerm: '',
  filterAbc: 'Todos',
  filterCategoria: 'Todas',
  filterCuadrante: 'Todos',
  filterCedi: 'todos',
  filterPrioridad: 'todas',
  filterDiasStock: 'todos',
  filterVista: 'seleccionados',
  showOnlyAdjusted: false,
  sortField: 'criticidad',
  sortDirection: 'asc',
};

export default function StepThreeReviewTabs({
  orderData,
  calculationResult,
  updateOrderData,
  onNext,
  onBack,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);

  // Filtros independientes por tienda (keyed by tienda_id)
  const [filtrosPorTienda, setFiltrosPorTienda] = useState<Record<string, FiltrosTienda>>({});

  // Estado para ediciones de productos por tienda
  // Key: `${tienda_id}_${codigo_producto}`
  const [ediciones, setEdiciones] = useState<Record<string, ProductoEditado>>({});

  // Estado para productos seleccionados por tienda
  // Key: tienda_id, Value: Set de codigos de productos seleccionados
  const [seleccionesPorTienda, setSeleccionesPorTienda] = useState<Record<string, Set<string>>>(() => {
    // Inicializar con solo los productos SUGERIDOS (es_sugerido=true)
    // Los no sugeridos empiezan desmarcados para que el usuario pueda buscarlos y agregarlos
    const inicial: Record<string, Set<string>> = {};
    // Usar orderData si tiene datos, sino calculationResult
    const pedidosSource = (orderData.pedidos_por_tienda && orderData.pedidos_por_tienda.length > 0)
      ? orderData.pedidos_por_tienda
      : calculationResult.pedidos_por_tienda || [];
    pedidosSource.forEach(pedido => {
      // Solo seleccionar productos donde es_sugerido es true (o cantidad_sugerida > 0 como fallback)
      const productosSugeridos = pedido.productos.filter(p =>
        p.es_sugerido === true || (p.es_sugerido === undefined && p.cantidad_sugerida_bultos > 0)
      );
      inicial[pedido.tienda_id] = new Set(productosSugeridos.map(p => p.codigo_producto));
    });
    return inicial;
  });

  // Estados para modales
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [selectedProductoSales, setSelectedProductoSales] = useState<ProductoPedidoSimplificado | null>(null);
  const [selectedTiendaId, setSelectedTiendaId] = useState<string>('');

  const [historicoTiendaModalOpen, setHistoricoTiendaModalOpen] = useState(false);
  const [selectedProductoHistoricoTienda, setSelectedProductoHistoricoTienda] = useState<ProductoPedidoSimplificado | null>(null);

  const [historicoCediModalOpen, setHistoricoCediModalOpen] = useState(false);
  const [selectedProductoHistoricoCedi, setSelectedProductoHistoricoCedi] = useState<ProductoPedidoSimplificado | null>(null);

  const [stockSeguridadModalOpen, setStockSeguridadModalOpen] = useState(false);
  const [selectedProductoSS, setSelectedProductoSS] = useState<ProductoPedidoSimplificado | null>(null);

  const [stockMinimoModalOpen, setStockMinimoModalOpen] = useState(false);
  const [selectedProductoROP, setSelectedProductoROP] = useState<ProductoPedidoSimplificado | null>(null);

  const [stockMaximoModalOpen, setStockMaximoModalOpen] = useState(false);
  const [selectedProductoMAX, setSelectedProductoMAX] = useState<ProductoPedidoSimplificado | null>(null);

  const [criticidadModalOpen, setCriticidadModalOpen] = useState(false);
  const [selectedProductoCriticidad, setSelectedProductoCriticidad] = useState<ProductoPedidoSimplificado | null>(null);

  // Usar orderData.pedidos_por_tienda si tiene datos (viene del paso 2 con ajustes),
  // de lo contrario usar calculationResult.pedidos_por_tienda (datos originales)
  const pedidos = (orderData.pedidos_por_tienda && orderData.pedidos_por_tienda.length > 0)
    ? orderData.pedidos_por_tienda
    : calculationResult.pedidos_por_tienda || [];
  const activePedido = pedidos[activeTab];

  // Obtener filtros de la tienda activa (o usar defaults)
  const getFiltrosTienda = useCallback((tiendaId: string): FiltrosTienda => {
    return filtrosPorTienda[tiendaId] || defaultFiltros;
  }, [filtrosPorTienda]);

  // Filtros de la tienda activa
  const filtrosActivos = activePedido ? getFiltrosTienda(activePedido.tienda_id) : defaultFiltros;

  // Actualizar un filtro específico de la tienda activa
  const updateFiltro = useCallback(<K extends keyof FiltrosTienda>(
    key: K,
    value: FiltrosTienda[K]
  ) => {
    if (!activePedido) return;
    setFiltrosPorTienda(prev => ({
      ...prev,
      [activePedido.tienda_id]: {
        ...getFiltrosTienda(activePedido.tienda_id),
        [key]: value,
      }
    }));
  }, [activePedido, getFiltrosTienda]);

  // Obtener selecciones de una tienda
  const getSeleccionesTienda = useCallback((tiendaId: string): Set<string> => {
    return seleccionesPorTienda[tiendaId] || new Set();
  }, [seleccionesPorTienda]);

  // Toggle selección de un producto
  const toggleSeleccion = useCallback((tiendaId: string, codigoProducto: string) => {
    setSeleccionesPorTienda(prev => {
      const currentSet = prev[tiendaId] || new Set();
      const newSet = new Set(currentSet);
      if (newSet.has(codigoProducto)) {
        newSet.delete(codigoProducto);
      } else {
        newSet.add(codigoProducto);
      }
      return { ...prev, [tiendaId]: newSet };
    });
  }, []);

  // Seleccionar/deseleccionar todos los productos visibles
  const toggleSeleccionarTodos = useCallback((tiendaId: string, productos: ProductoPedidoSimplificado[]) => {
    const codigos = productos.map(p => p.codigo_producto);
    const currentSet = seleccionesPorTienda[tiendaId] || new Set();
    const todosSeleccionados = codigos.every(c => currentSet.has(c));

    setSeleccionesPorTienda(prev => {
      const newSet = new Set(prev[tiendaId] || new Set());
      if (todosSeleccionados) {
        codigos.forEach(c => newSet.delete(c));
      } else {
        codigos.forEach(c => newSet.add(c));
      }
      return { ...prev, [tiendaId]: newSet };
    });
  }, [seleccionesPorTienda]);

  // Sincronizar ediciones con orderData
  useEffect(() => {
    if (Object.keys(ediciones).length > 0) {
      // Actualizar pedidos_por_tienda con las ediciones
      const pedidosActualizados = orderData.pedidos_por_tienda.map(pedido => ({
        ...pedido,
        productos: pedido.productos.map(prod => {
          const key = `${pedido.tienda_id}_${prod.codigo_producto}`;
          const edicion = ediciones[key];
          if (edicion) {
            return {
              ...prod,
              cantidad_sugerida_bultos: edicion.cantidad_pedida_bultos,
            };
          }
          return prod;
        })
      }));
      updateOrderData({ pedidos_por_tienda: pedidosActualizados });
    }
  }, [ediciones, orderData.pedidos_por_tienda, updateOrderData]);

  // Formatear número
  const formatNumber = (num: number, decimals: number = 0): string => {
    return new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  };

  // Calcular SS, ROP, MAX estimados en días (simplificado)
  const getStockParamsDias = (producto: ProductoPedidoSimplificado) => {
    const abc = producto.clasificacion_abc || 'C';

    // Días de cobertura por ABC (simplificados)
    // SS: Stock de Seguridad, ROP: Punto de Reorden, MAX: Stock Máximo
    const diasConfig = abc === 'A' ? { ss: 1.5, rop: 3, max: 5 } :
                       abc === 'B' ? { ss: 2, rop: 4, max: 8 } :
                       { ss: 3, rop: 6, max: 12 };

    return diasConfig;
  };

  // Calcular SS, ROP, MAX en bultos
  const getStockParams = (producto: ProductoPedidoSimplificado) => {
    const p75 = producto.prom_p75_unid;
    const upb = producto.unidades_por_bulto;
    const diasConfig = getStockParamsDias(producto);

    const ss = Math.ceil((p75 * diasConfig.ss) / upb);
    const rop = Math.ceil((p75 * diasConfig.rop) / upb);
    const max = Math.ceil((p75 * diasConfig.max) / upb);

    return { ss, rop, max, diasSS: diasConfig.ss, diasROP: diasConfig.rop, diasMAX: diasConfig.max };
  };

  // Calcular criticidad basada en días de stock vs SS, ROP, MAX
  // Niveles: CRÍTICO (stock ≤ SS), URGENTE (SS < stock ≤ ROP), ÓPTIMO (ROP < stock ≤ MAX), EXCESO (stock > MAX)
  const getCriticidad = (producto: ProductoPedidoSimplificado): {
    nivel: number;
    nivelNombre: 'critico' | 'urgente' | 'optimo' | 'exceso';
    icon: string;
    color: string;
    descripcion: string;
  } => {
    const dias = producto.dias_stock;
    const abc = producto.clasificacion_abc || 'C';
    const { diasSS, diasROP, diasMAX } = getStockParams(producto);

    // Pesos por clasificación ABC (A es más importante)
    const pesoABC = { 'A': 1, 'B': 2, 'C': 3 }[abc] || 3;

    if (dias <= diasSS) {
      // CRÍTICO - Por debajo del Stock de Seguridad
      const icon = abc === 'A' ? '🔴🔴' : '🔴';
      return {
        nivel: 10 + pesoABC,
        nivelNombre: 'critico',
        icon,
        color: 'text-red-700',
        descripcion: 'CRÍTICO'
      };
    } else if (dias <= diasROP) {
      // URGENTE - Entre SS y ROP (hay que pedir)
      const icon = abc === 'A' ? '🟠🟠' : '🟠';
      return {
        nivel: 20 + pesoABC,
        nivelNombre: 'urgente',
        icon,
        color: 'text-orange-600',
        descripcion: 'URGENTE'
      };
    } else if (dias <= diasMAX) {
      // ÓPTIMO - Entre ROP y MAX (nivel ideal)
      return {
        nivel: 30 + pesoABC,
        nivelNombre: 'optimo',
        icon: '✓',
        color: 'text-green-600',
        descripcion: 'ÓPTIMO'
      };
    } else {
      // EXCESO - Por encima del máximo
      return {
        nivel: 40 + pesoABC,
        nivelNombre: 'exceso',
        icon: '⚠️',
        color: 'text-blue-600',
        descripcion: 'EXCESO'
      };
    }
  };

  // Obtener cantidad a pedir (editada o sugerida)
  const getCantidadPedir = (tiendaId: string, producto: ProductoPedidoSimplificado): number => {
    const key = `${tiendaId}_${producto.codigo_producto}`;
    return ediciones[key]?.cantidad_pedida_bultos ?? producto.cantidad_sugerida_bultos;
  };

  // Obtener categorías únicas del pedido activo
  const categorias = useMemo(() => {
    if (!activePedido) return ['Todas'];
    const cats = new Set(activePedido.productos.map(p => p.categoria || 'Sin categoría'));
    return ['Todas', ...Array.from(cats).sort()];
  }, [activePedido]);

  // Obtener cuadrantes únicos del pedido activo
  const cuadrantes = useMemo(() => {
    if (!activePedido) return ['Todos'];
    const cuads = new Set(activePedido.productos.map(p => p.cuadrante || 'NO ESPECIFICADO'));
    return ['Todos', ...Array.from(cuads).sort()];
  }, [activePedido]);

  // Filtrar y ordenar productos (usa filtros específicos de la tienda)
  const getFilteredProducts = (productos: ProductoPedidoSimplificado[], tiendaId: string) => {
    const filtros = getFiltrosTienda(tiendaId);

    let result = productos.filter((p) => {
      // Búsqueda por texto
      const matchSearch =
        !filtros.searchTerm ||
        p.descripcion_producto.toLowerCase().includes(filtros.searchTerm.toLowerCase()) ||
        p.codigo_producto.toLowerCase().includes(filtros.searchTerm.toLowerCase());

      // Filtro ABC
      const matchAbc = filtros.filterAbc === 'Todos' || p.clasificacion_abc === filtros.filterAbc;

      // Filtro Categoría
      const matchCat = filtros.filterCategoria === 'Todas' || (p.categoria || 'Sin categoría') === filtros.filterCategoria;

      // Filtro Cuadrante
      const matchCuadrante = filtros.filterCuadrante === 'Todos' || (p.cuadrante || 'NO ESPECIFICADO') === filtros.filterCuadrante;

      // Filtro CEDI
      let matchCedi = true;
      if (filtros.filterCedi === 'con_stock') matchCedi = p.stock_cedi_origen > 0;
      if (filtros.filterCedi === 'sin_stock') matchCedi = p.stock_cedi_origen === 0;

      // Filtro solo ajustados por DPD+U
      const matchAdjusted = !filtros.showOnlyAdjusted || p.ajustado_por_dpdu;

      // Filtro por prioridad (criticidad)
      let matchPrioridad = true;
      if (filtros.filterPrioridad !== 'todas') {
        const criticidad = getCriticidad(p);
        matchPrioridad = criticidad.nivelNombre === filtros.filterPrioridad;
      }

      // Filtro por Días Stock
      let matchDiasStock = true;
      if (filtros.filterDiasStock !== 'todos') {
        const dias = p.dias_stock;
        switch (filtros.filterDiasStock) {
          case '0-1':
            matchDiasStock = dias >= 0 && dias <= 1;
            break;
          case '1-2':
            matchDiasStock = dias > 1 && dias <= 2;
            break;
          case '2-4':
            matchDiasStock = dias > 2 && dias <= 4;
            break;
          case '4-5':
            matchDiasStock = dias > 4 && dias <= 5;
            break;
          case '5+':
            matchDiasStock = dias > 5;
            break;
        }
      }

      // Filtro por Vista (seleccionados/no_seleccionados)
      let matchVista = true;
      const selecciones = getSeleccionesTienda(tiendaId);
      const estaSeleccionado = selecciones.has(p.codigo_producto);
      if (filtros.filterVista === 'seleccionados') matchVista = estaSeleccionado;
      if (filtros.filterVista === 'no_seleccionados') matchVista = !estaSeleccionado;

      return matchSearch && matchAbc && matchCat && matchCuadrante && matchCedi && matchAdjusted && matchPrioridad && matchDiasStock && matchVista;
    });

    // Ordenar
    result.sort((a, b) => {
      let comparison = 0;
      switch (filtros.sortField) {
        case 'codigo':
          comparison = a.codigo_producto.localeCompare(b.codigo_producto);
          break;
        case 'descripcion':
          comparison = a.descripcion_producto.localeCompare(b.descripcion_producto);
          break;
        case 'abc': {
          const abcOrder: Record<string, number> = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
          comparison = (abcOrder[a.clasificacion_abc || ''] || 99) - (abcOrder[b.clasificacion_abc || ''] || 99);
          break;
        }
        case 'stock':
          comparison = a.stock_tienda - b.stock_tienda;
          break;
        case 'dias':
          comparison = a.dias_stock - b.dias_stock;
          break;
        case 'p75':
          comparison = a.prom_p75_unid - b.prom_p75_unid;
          break;
        case 'cedi':
          comparison = a.stock_cedi_origen - b.stock_cedi_origen;
          break;
        case 'sugerido':
          comparison = a.cantidad_sugerida_bultos - b.cantidad_sugerida_bultos;
          break;
        case 'criticidad':
          comparison = getCriticidad(a).nivel - getCriticidad(b).nivel;
          break;
        case 'pedir':
          comparison = getCantidadPedir(tiendaId, a) - getCantidadPedir(tiendaId, b);
          break;
      }
      return filtros.sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  };

  // Toggle sort (usa filtros de la tienda activa)
  const handleSort = (field: SortField) => {
    if (filtrosActivos.sortField === field) {
      updateFiltro('sortDirection', filtrosActivos.sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      updateFiltro('sortField', field);
      updateFiltro('sortDirection', 'asc');
    }
  };

  // Sort icon (usa filtros de la tienda activa)
  const SortIcon = ({ field }: { field: SortField }) => {
    if (filtrosActivos.sortField !== field) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-gray-700 ml-0.5">{filtrosActivos.sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Resumen consolidado (usando productos filtrados por tienda)
  const resumenConsolidado = useMemo(() => {
    let totalProductos = 0;
    let totalBultos = 0;
    let totalUnidades = 0;
    let productosAjustados = 0;

    pedidos.forEach((pedido) => {
      const filteredProducts = getFilteredProducts(pedido.productos, pedido.tienda_id);
      totalProductos += filteredProducts.length;
      filteredProducts.forEach(p => {
        const cantidadPedir = getCantidadPedir(pedido.tienda_id, p);
        totalBultos += cantidadPedir;
        totalUnidades += cantidadPedir * p.unidades_por_bulto;
        if (p.ajustado_por_dpdu) productosAjustados += 1;
      });
    });

    return {
      totalTiendas: pedidos.length,
      totalProductos,
      totalBultos,
      totalUnidades,
      productosAjustados,
    };
  }, [pedidos, filtrosPorTienda, ediciones, seleccionesPorTienda]);

  // Resumen de la tienda activa (usando productos filtrados)
  const resumenTiendaActivaFiltrada = useMemo(() => {
    if (!activePedido) return { productos: 0, bultos: 0, unidades: 0, ajustados: 0 };

    const filteredProducts = getFilteredProducts(activePedido.productos, activePedido.tienda_id);
    let bultos = 0;
    let unidades = 0;
    let ajustados = 0;

    filteredProducts.forEach(p => {
      const cantidadPedir = getCantidadPedir(activePedido.tienda_id, p);
      bultos += cantidadPedir;
      unidades += cantidadPedir * p.unidades_por_bulto;
      if (p.ajustado_por_dpdu) ajustados += 1;
    });

    return {
      productos: filteredProducts.length,
      bultos,
      unidades,
      ajustados,
    };
  }, [activePedido, filtrosPorTienda, ediciones, seleccionesPorTienda]);

  // Color para días de stock
  const getDiasStockColor = (dias: number): string => {
    if (dias <= 0.5) return 'text-red-700 bg-red-100';
    if (dias <= 1) return 'text-orange-700 bg-orange-100';
    if (dias <= 2) return 'text-yellow-700 bg-yellow-100';
    return 'text-green-700 bg-green-100';
  };

  // Obtener nota
  const getNota = (tiendaId: string, producto: ProductoPedidoSimplificado): string => {
    const key = `${tiendaId}_${producto.codigo_producto}`;
    return ediciones[key]?.nota ?? '';
  };

  // Manejar cambio de cantidad
  const handleCantidadChange = useCallback((tiendaId: string, codigoProducto: string, valor: number) => {
    setEdiciones(prev => ({
      ...prev,
      [`${tiendaId}_${codigoProducto}`]: {
        ...(prev[`${tiendaId}_${codigoProducto}`] || { nota: '' }),
        cantidad_pedida_bultos: Math.max(0, valor)
      }
    }));
  }, []);

  // Manejar cambio de nota
  const handleNotaChange = useCallback((tiendaId: string, codigoProducto: string, nota: string) => {
    setEdiciones(prev => {
      const key = `${tiendaId}_${codigoProducto}`;
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          cantidad_pedida_bultos: existing?.cantidad_pedida_bultos ?? 0,
          nota
        }
      };
    });
  }, []);

  // Continuar al siguiente paso con solo productos SELECCIONADOS Y VISIBLES (por tienda)
  const handleContinue = useCallback(() => {
    // Actualizar pedidos_por_tienda con solo los productos que están VISIBLES (pasan filtros) Y SELECCIONADOS
    const pedidosActualizados = orderData.pedidos_por_tienda.map(pedido => {
      const selecciones = getSeleccionesTienda(pedido.tienda_id);
      // Usar getFilteredProducts para respetar los filtros de display (ABC, categoría, etc.)
      // y luego filtrar solo los seleccionados
      const productosVisibles = getFilteredProducts(pedido.productos, pedido.tienda_id);
      const productosSeleccionados = productosVisibles.filter(p => selecciones.has(p.codigo_producto));

      // Calcular nuevos totales basados en productos seleccionados
      let totalBultos = 0;
      let totalUnidades = 0;
      let productosAjustados = 0;

      const productosConEdiciones = productosSeleccionados.map(prod => {
        const key = `${pedido.tienda_id}_${prod.codigo_producto}`;
        const edicion = ediciones[key];
        const cantidadFinal = edicion?.cantidad_pedida_bultos ?? prod.cantidad_sugerida_bultos;

        totalBultos += cantidadFinal;
        totalUnidades += cantidadFinal * prod.unidades_por_bulto;
        if (prod.ajustado_por_dpdu) productosAjustados += 1;

        return {
          ...prod,
          cantidad_sugerida_bultos: cantidadFinal,
          cantidad_sugerida_unid: cantidadFinal * prod.unidades_por_bulto,
        };
      });

      return {
        ...pedido,
        productos: productosConEdiciones,
        total_productos: productosConEdiciones.length,
        total_bultos: totalBultos,
        total_unidades: totalUnidades,
        productos_ajustados_dpdu: productosAjustados,
      };
    });

    updateOrderData({ pedidos_por_tienda: pedidosActualizados });
    onNext();
  }, [orderData.pedidos_por_tienda, ediciones, seleccionesPorTienda, filtrosPorTienda, updateOrderData, onNext]);

  // Handlers para modales
  const handleOpenSalesModal = (producto: ProductoPedidoSimplificado, tiendaId: string) => {
    setSelectedProductoSales(producto);
    setSelectedTiendaId(tiendaId);
    setSalesModalOpen(true);
  };

  const handleOpenHistoricoTienda = (producto: ProductoPedidoSimplificado, tiendaId: string) => {
    setSelectedProductoHistoricoTienda(producto);
    setSelectedTiendaId(tiendaId);
    setHistoricoTiendaModalOpen(true);
  };

  const handleOpenHistoricoCedi = (producto: ProductoPedidoSimplificado) => {
    setSelectedProductoHistoricoCedi(producto);
    setHistoricoCediModalOpen(true);
  };

  const handleOpenSS = (producto: ProductoPedidoSimplificado) => {
    setSelectedProductoSS(producto);
    setStockSeguridadModalOpen(true);
  };

  const handleOpenROP = (producto: ProductoPedidoSimplificado) => {
    setSelectedProductoROP(producto);
    setStockMinimoModalOpen(true);
  };

  const handleOpenMAX = (producto: ProductoPedidoSimplificado) => {
    setSelectedProductoMAX(producto);
    setStockMaximoModalOpen(true);
  };

  const handleOpenCriticidad = (producto: ProductoPedidoSimplificado) => {
    setSelectedProductoCriticidad(producto);
    setCriticidadModalOpen(true);
  };

  // Contadores para filtros
  const contadores = useMemo(() => {
    if (!activePedido) return { porABC: { A: 0, B: 0, C: 0, D: 0 }, porCategoria: {} };

    const porABC: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    const porCategoria: Record<string, number> = {};

    activePedido.productos.forEach(p => {
      if (p.clasificacion_abc) {
        porABC[p.clasificacion_abc] = (porABC[p.clasificacion_abc] || 0) + 1;
      }
      const cat = p.categoria || 'Sin categoría';
      porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    });

    return { porABC, porCategoria };
  }, [activePedido]);

  // Renderizar tabla de productos
  const renderProductTable = (pedido: PedidoTienda) => {
    const filteredProducts = getFilteredProducts(pedido.productos, pedido.tienda_id);

    if (filteredProducts.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>No se encontraron productos con los filtros aplicados</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-100 sticky top-0 z-10">
            {/* Fila de categorías */}
            <tr className="border-b-2 border-gray-300">
              <th className="bg-gray-200 px-1 py-1 text-center font-bold text-gray-700 text-xs" style={{ width: '32px' }}></th>
              <th className="bg-gray-200 px-1 py-1 text-center font-bold text-gray-700 text-xs" style={{ width: '32px' }}>#</th>
              <th colSpan={4} className="bg-blue-200 px-2 py-1 text-center font-bold text-blue-900 text-xs uppercase border-r border-blue-300">
                Producto
              </th>
              <th colSpan={2} className="bg-purple-200 px-2 py-1 text-center font-bold text-purple-900 text-xs uppercase border-r border-purple-300">
                Ventas
              </th>
              <th colSpan={5} className="bg-green-200 px-2 py-1 text-center font-bold text-green-900 text-xs uppercase border-r border-green-300">
                Inventario
              </th>
              <th colSpan={6} className="bg-orange-200 px-2 py-1 text-center font-bold text-orange-900 text-xs uppercase border-r border-orange-300">
                Cálculos Pedido
              </th>
              <th colSpan={3} className="bg-yellow-200 px-2 py-1 text-center font-bold text-yellow-900 text-xs uppercase">
                Pedido
              </th>
            </tr>
            {/* Fila de columnas */}
            <tr>
              {/* Checkbox seleccionar todos */}
              <th className="bg-gray-100 px-1 py-1 text-center text-xs font-medium text-gray-500 w-8">
                <input
                  type="checkbox"
                  checked={filteredProducts.length > 0 && filteredProducts.every(p => getSeleccionesTienda(pedido.tienda_id).has(p.codigo_producto))}
                  ref={(el) => {
                    if (el) {
                      const selecciones = getSeleccionesTienda(pedido.tienda_id);
                      const seleccionados = filteredProducts.filter(p => selecciones.has(p.codigo_producto)).length;
                      el.indeterminate = seleccionados > 0 && seleccionados < filteredProducts.length;
                    }
                  }}
                  onChange={() => toggleSeleccionarTodos(pedido.tienda_id, filteredProducts)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  title="Seleccionar/deseleccionar todos"
                />
              </th>
              <th className="bg-gray-100 px-1 py-1 text-center text-xs font-medium text-gray-500 w-8">#</th>
              {/* PRODUCTO */}
              <th className="bg-blue-50 px-1 py-1 text-left text-xs font-medium text-gray-600 cursor-pointer hover:bg-blue-100 w-16" onClick={() => handleSort('codigo')}>
                Código <SortIcon field="codigo" />
              </th>
              <th className="bg-blue-50 px-1 py-1 text-left text-xs font-medium text-gray-600 cursor-pointer hover:bg-blue-100" style={{ minWidth: '180px' }} onClick={() => handleSort('descripcion')}>
                Descripción <SortIcon field="descripcion" />
              </th>
              <th className="bg-blue-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-12">U/B</th>
              <th className="bg-blue-50 px-1 py-1 text-center text-xs font-medium text-gray-600 border-r border-blue-100 w-14" title="Cuadrante del producto">
                CUAD
              </th>
              {/* VENTAS */}
              <th className="bg-purple-50 px-0 py-1 text-center text-xs font-medium text-gray-600 w-6" title="Ver análisis">📈</th>
              <th className="bg-purple-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-purple-100 border-r border-purple-100 w-12" onClick={() => handleSort('p75')}>
                P75 <SortIcon field="p75" />
              </th>
              {/* INVENTARIO */}
              <th className="bg-green-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-green-100 w-12" onClick={() => handleSort('stock')}>
                STK <SortIcon field="stock" />
              </th>
              <th className="bg-green-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-11" title="Stock en tránsito">TRÁN</th>
              <th className="bg-green-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-11" title="Stock total">TOT</th>
              <th className="bg-green-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-green-100 w-11" onClick={() => handleSort('dias')}>
                DÍAS <SortIcon field="dias" />
              </th>
              <th className="bg-green-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-green-100 border-r border-green-100 w-14" onClick={() => handleSort('cedi')}>
                CEDI <SortIcon field="cedi" />
              </th>
              {/* CÁLCULOS PEDIDO */}
              <th className="bg-orange-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-orange-100 w-9" onClick={() => handleSort('abc')}>
                ABC <SortIcon field="abc" />
              </th>
              <th className="bg-orange-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-orange-100 w-7" onClick={() => handleSort('criticidad')} title="Urgencia">🔥</th>
              <th className="bg-orange-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-9" title="Stock de Seguridad">SS</th>
              <th className="bg-orange-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-10" title="Punto de Reorden">ROP</th>
              <th className="bg-orange-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-10" title="Stock Máximo">MAX</th>
              <th className="bg-orange-50 px-1 py-1 text-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-orange-100 border-r border-orange-100 w-12" onClick={() => handleSort('sugerido')}>
                SUG <SortIcon field="sugerido" />
              </th>
              {/* PEDIDO */}
              <th className="bg-yellow-50 px-1 py-1 text-center text-xs font-medium text-gray-700 cursor-pointer hover:bg-yellow-100 w-14" onClick={() => handleSort('pedir')}>
                PEDIR <SortIcon field="pedir" />
              </th>
              <th className="bg-yellow-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-14">PESO</th>
              <th className="bg-yellow-50 px-1 py-1 text-center text-xs font-medium text-gray-600 w-16">NOTAS</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProducts.map((producto, idx) => {
              const criticidad = getCriticidad(producto);
              const stockParams = getStockParams(producto);
              const cantidadPedir = getCantidadPedir(pedido.tienda_id, producto);
              const nota = getNota(pedido.tienda_id, producto);
              const upb = producto.unidades_por_bulto;
              const stockTransito = producto.stock_en_transito || 0;
              const stockTotal = producto.stock_tienda + stockTransito;
              const estaSeleccionado = getSeleccionesTienda(pedido.tienda_id).has(producto.codigo_producto);

              return (
                <tr
                  key={producto.codigo_producto}
                  className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                    producto.ajustado_por_dpdu ? 'border-l-4 border-l-amber-400' : ''
                  } ${criticidad.nivel <= 2 ? 'bg-red-50' : ''} ${!estaSeleccionado ? 'opacity-50' : ''} hover:bg-blue-50`}
                >
                  {/* Checkbox */}
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={estaSeleccionado}
                      onChange={() => toggleSeleccion(pedido.tienda_id, producto.codigo_producto)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    />
                  </td>
                  {/* # */}
                  <td className="px-1 py-1 text-center text-xs text-gray-400">{idx + 1}</td>
                  {/* Código */}
                  <td className="bg-blue-50/30 px-1 py-1 text-xs text-gray-700 font-mono">{producto.codigo_producto}</td>
                  {/* Descripción */}
                  <td className="bg-blue-50/30 px-1 py-1" style={{ minWidth: '180px' }}>
                    <span className="text-xs font-medium text-gray-900 line-clamp-1" title={`${producto.descripcion_producto}${producto.categoria ? ` - ${producto.categoria}` : ''}`}>
                      {producto.descripcion_producto}
                    </span>
                  </td>
                  {/* U/B */}
                  <td className="bg-blue-50/30 px-1 py-1 text-center">
                    <div className="text-xs font-medium text-gray-700">{upb}</div>
                    <div className="text-[10px] text-gray-400">Bulto</div>
                  </td>
                  {/* Cuadrante */}
                  <td className="bg-blue-50/30 px-1 py-1 text-center border-r border-gray-100">
                    <span
                      className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded"
                      title={`Cuadrante: ${producto.cuadrante || 'NO ESPECIFICADO'}`}
                    >
                      {producto.cuadrante ? producto.cuadrante.replace('CUADRANTE ', '') : 'N/E'}
                    </span>
                  </td>
                  {/* 📈 Ventas */}
                  <td className="bg-purple-50/30 px-0 py-1 text-center">
                    <span
                      className="text-xs text-purple-600 cursor-pointer hover:text-purple-800"
                      title="Ver análisis de ventas"
                      onClick={() => handleOpenSalesModal(producto, pedido.tienda_id)}
                    >📈</span>
                  </td>
                  {/* P75 */}
                  <td className="bg-purple-50/30 px-1 py-1 text-center border-r border-gray-100">
                    <div className="text-xs font-medium text-purple-700">{(producto.prom_p75_unid / upb).toFixed(1)}</div>
                    <div className="text-[10px] text-purple-400">{formatNumber(producto.prom_p75_unid, 0)}u</div>
                  </td>
                  {/* Stock Tienda */}
                  <td
                    className="bg-green-50/30 px-1 py-1 text-center cursor-pointer hover:bg-green-100"
                    title="Ver historial de inventario tienda"
                    onClick={() => handleOpenHistoricoTienda(producto, pedido.tienda_id)}
                  >
                    <div className="text-xs font-medium text-gray-800">{(producto.stock_tienda / upb).toFixed(1).replace('.', ',')}</div>
                    <div className="text-[10px] text-gray-400">{formatNumber(producto.stock_tienda)}u</div>
                  </td>
                  {/* TRÁN */}
                  <td className="bg-green-50/30 px-1 py-1 text-center">
                    <div className="text-xs font-medium text-blue-600">{(stockTransito / upb).toFixed(1).replace('.', ',')}</div>
                    <div className="text-[10px] text-blue-400">{formatNumber(stockTransito)}u</div>
                  </td>
                  {/* TOT */}
                  <td className="bg-green-50/30 px-1 py-1 text-center">
                    <div className="text-xs font-medium text-gray-800">{(stockTotal / upb).toFixed(1).replace('.', ',')}</div>
                    <div className="text-[10px] text-gray-400">{formatNumber(stockTotal)}u</div>
                  </td>
                  {/* Días Stock */}
                  <td className="bg-green-50/30 px-1 py-1 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getDiasStockColor(producto.dias_stock)}`}>
                      {producto.dias_stock < 999 ? producto.dias_stock.toFixed(1) : '∞'}
                    </span>
                  </td>
                  {/* Stock CEDI */}
                  <td
                    className="bg-green-50/30 px-1 py-1 text-center border-r border-gray-100 cursor-pointer hover:bg-green-100"
                    title="Ver historial de inventario CEDI"
                    onClick={() => handleOpenHistoricoCedi(producto)}
                  >
                    <div className="text-xs font-medium text-green-700">{(producto.stock_cedi_origen / upb).toFixed(1).replace('.', ',')}</div>
                    <div className="text-[10px] text-green-500">{formatNumber(producto.stock_cedi_origen)}u</div>
                  </td>
                  {/* ABC */}
                  <td className="bg-orange-50/30 px-1 py-1 text-center">
                    {producto.clasificacion_abc && (
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${
                        producto.clasificacion_abc === 'A' ? 'bg-red-100 text-red-700' :
                        producto.clasificacion_abc === 'B' ? 'bg-yellow-100 text-yellow-700' :
                        producto.clasificacion_abc === 'C' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                      }`}>{producto.clasificacion_abc}</span>
                    )}
                  </td>
                  {/* Criticidad */}
                  <td className="bg-orange-50/30 px-1 py-1 text-center">
                    <button
                      onClick={() => handleOpenCriticidad(producto)}
                      className={`${criticidad.color} hover:underline cursor-pointer transition-colors font-bold`}
                      title={`${criticidad.descripcion}\nStock: ${producto.dias_stock.toFixed(1)}d | SS: ${stockParams.diasSS}d | ROP: ${stockParams.diasROP}d | MAX: ${stockParams.diasMAX}d`}
                    >
                      {criticidad.icon}
                    </button>
                  </td>
                  {/* SS */}
                  <td
                    className="bg-orange-50/30 px-1 py-1 text-center text-xs cursor-pointer hover:bg-orange-100"
                    title={`SS: ${stockParams.diasSS}d | ${stockParams.ss} bultos`}
                    onClick={() => handleOpenSS(producto)}
                  >
                    <span className="font-medium text-orange-800 block">{stockParams.diasSS}</span>
                    <span className="text-[10px] text-gray-400 block">{stockParams.ss}b</span>
                  </td>
                  {/* ROP */}
                  <td
                    className="bg-orange-50/30 px-1 py-1 text-center text-xs cursor-pointer hover:bg-orange-100"
                    title={`ROP: ${stockParams.diasROP}d | ${stockParams.rop} bultos`}
                    onClick={() => handleOpenROP(producto)}
                  >
                    <span className="font-medium text-orange-800 block">{stockParams.diasROP}</span>
                    <span className="text-[10px] text-gray-400 block">{stockParams.rop}b</span>
                  </td>
                  {/* MAX */}
                  <td
                    className="bg-orange-50/30 px-1 py-1 text-center text-xs cursor-pointer hover:bg-orange-100"
                    title={`MAX: ${stockParams.diasMAX}d | ${stockParams.max} bultos`}
                    onClick={() => handleOpenMAX(producto)}
                  >
                    <span className="font-medium text-orange-800 block">{stockParams.diasMAX}</span>
                    <span className="text-[10px] text-gray-400 block">{stockParams.max}b</span>
                  </td>
                  {/* Sugerido */}
                  <td className="bg-orange-50/30 px-1 py-1 text-center border-r border-gray-100">
                    <div className="text-xs font-bold text-orange-600">{producto.cantidad_sugerida_bultos}</div>
                    <div className="text-[10px] text-gray-400">{producto.ajustado_por_dpdu ? 'ΔDPD' : `~${Math.round((producto.cantidad_sugerida_bultos * upb) / (producto.prom_p75_unid || 1))}d`}</div>
                  </td>
                  {/* Pedir */}
                  <td className="bg-yellow-50/30 px-1 py-1 text-center">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={cantidadPedir}
                      onChange={(e) => handleCantidadChange(pedido.tienda_id, producto.codigo_producto, parseFloat(e.target.value) || 0)}
                      className="w-14 px-1 py-0.5 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-yellow-400 font-medium"
                    />
                  </td>
                  {/* Peso */}
                  <td className="bg-yellow-50/30 px-1 py-1 text-center text-xs text-gray-500">
                    {producto.peso_kg ? formatNumber(cantidadPedir * producto.peso_kg, 1) : '—'}
                  </td>
                  {/* Nota */}
                  <td className="bg-yellow-50/30 px-1 py-1 text-center">
                    <input
                      type="text"
                      value={nota}
                      onChange={(e) => handleNotaChange(pedido.tienda_id, producto.codigo_producto, e.target.value)}
                      placeholder="Notas..."
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-yellow-400"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Revisar Pedidos por Tienda</h2>
          <p className="mt-1 text-sm text-gray-500">
            Revise los productos sugeridos para cada tienda. Los productos marcados con DPD+U
            fueron ajustados por escasez de stock.
          </p>
        </div>

        {/* Tabs de tiendas */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto" aria-label="Tabs">
            {pedidos.map((pedido, index) => (
              <button
                key={pedido.tienda_id}
                onClick={() => setActiveTab(index)}
                className={`${
                  activeTab === index
                    ? 'border-gray-900 text-gray-900 bg-gray-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 px-6 border-b-2 font-medium text-sm transition-colors`}
              >
                {pedido.tienda_nombre}
              </button>
            ))}
          </nav>
        </div>

        {/* Filtros (independientes por tienda) */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-3">
            {/* Búsqueda */}
            <div className="flex items-center gap-1">
              <span className="text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="Buscar..."
                value={filtrosActivos.searchTerm}
                onChange={(e) => updateFiltro('searchTerm', e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>

            {/* Filtro Categoría */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Cat:</label>
              <select
                value={filtrosActivos.filterCategoria}
                onChange={(e) => updateFiltro('filterCategoria', e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                {categorias.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'Todas' ? `Todas (${activePedido?.productos.length || 0})` :
                      `${cat.length > 12 ? cat.slice(0, 12) + '...' : cat} (${contadores.porCategoria[cat] || 0})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro ABC */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">ABC:</label>
              <select
                value={filtrosActivos.filterAbc}
                onChange={(e) => updateFiltro('filterAbc', e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="Todos">Todos ({activePedido?.productos.length || 0})</option>
                <option value="A">A ({contadores.porABC.A})</option>
                <option value="B">B ({contadores.porABC.B})</option>
                <option value="C">C ({contadores.porABC.C})</option>
                <option value="D">D ({contadores.porABC.D})</option>
              </select>
            </div>

            {/* Filtro Cuadrante */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Cuad:</label>
              <select
                value={filtrosActivos.filterCuadrante}
                onChange={(e) => updateFiltro('filterCuadrante', e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                {cuadrantes.map(cuad => {
                  const count = activePedido?.productos.filter(p =>
                    (p.cuadrante || 'NO ESPECIFICADO') === cuad || cuad === 'Todos'
                  ).length || 0;
                  const displayName = cuad.replace('CUADRANTE ', '');
                  return (
                    <option key={cuad} value={cuad}>
                      {cuad === 'Todos' ? `Todos (${activePedido?.productos.length || 0})` :
                       `${displayName} (${count})`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Filtro CEDI */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">CEDI:</label>
              <select
                value={filtrosActivos.filterCedi}
                onChange={(e) => updateFiltro('filterCedi', e.target.value as 'todos' | 'con_stock' | 'sin_stock')}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="todos">Todos ({activePedido?.productos.length || 0})</option>
                <option value="con_stock">Con stock ({activePedido?.productos.filter(p => p.stock_cedi_origen > 0).length || 0})</option>
                <option value="sin_stock">Sin stock ({activePedido?.productos.filter(p => p.stock_cedi_origen === 0).length || 0})</option>
              </select>
            </div>

            {/* Filtro Prioridad (Criticidad) */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Prioridad:</label>
              <select
                value={filtrosActivos.filterPrioridad}
                onChange={(e) => updateFiltro('filterPrioridad', e.target.value as 'todas' | 'critico' | 'urgente' | 'optimo' | 'exceso')}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="todas">Todas</option>
                <option value="critico">🔴 Crítico ({activePedido?.productos.filter(p => getCriticidad(p).nivelNombre === 'critico').length || 0})</option>
                <option value="urgente">🟠 Urgente ({activePedido?.productos.filter(p => getCriticidad(p).nivelNombre === 'urgente').length || 0})</option>
                <option value="optimo">🟢 Óptimo ({activePedido?.productos.filter(p => getCriticidad(p).nivelNombre === 'optimo').length || 0})</option>
                <option value="exceso">🔵 Exceso ({activePedido?.productos.filter(p => getCriticidad(p).nivelNombre === 'exceso').length || 0})</option>
              </select>
            </div>

            {/* Filtro Días Stock */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Días Stock:</label>
              <select
                value={filtrosActivos.filterDiasStock}
                onChange={(e) => updateFiltro('filterDiasStock', e.target.value as 'todos' | '0-1' | '1-2' | '2-4' | '4-5' | '5+')}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="todos">Todos ({activePedido?.productos.length || 0})</option>
                <option value="0-1">0-1 días ({activePedido?.productos.filter(p => p.dias_stock >= 0 && p.dias_stock <= 1).length || 0})</option>
                <option value="1-2">1-2 días ({activePedido?.productos.filter(p => p.dias_stock > 1 && p.dias_stock <= 2).length || 0})</option>
                <option value="2-4">2-4 días ({activePedido?.productos.filter(p => p.dias_stock > 2 && p.dias_stock <= 4).length || 0})</option>
                <option value="4-5">4-5 días ({activePedido?.productos.filter(p => p.dias_stock > 4 && p.dias_stock <= 5).length || 0})</option>
                <option value="5+">5+ días ({activePedido?.productos.filter(p => p.dias_stock > 5).length || 0})</option>
              </select>
            </div>

            {/* Filtro Vista (Seleccionados/No seleccionados) */}
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-gray-600">Vista:</label>
              <select
                value={filtrosActivos.filterVista}
                onChange={(e) => updateFiltro('filterVista', e.target.value as 'todos' | 'seleccionados' | 'no_seleccionados')}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
              >
                <option value="seleccionados">
                  ✓ Seleccionados ({activePedido ? getSeleccionesTienda(activePedido.tienda_id).size : 0})
                </option>
                <option value="no_seleccionados">
                  No seleccionados ({activePedido ? activePedido.productos.length - getSeleccionesTienda(activePedido.tienda_id).size : 0})
                </option>
                <option value="todos">Todos ({activePedido?.productos.length || 0})</option>
              </select>
            </div>

            {/* Toggle ajustados */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filtrosActivos.showOnlyAdjusted}
                onChange={(e) => updateFiltro('showOnlyAdjusted', e.target.checked)}
                className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
              />
              Solo ajustados DPD+U
            </label>
          </div>

          {/* Resumen de tienda activa (filtrado) */}
          {activePedido && (
            <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-4 text-xs flex-wrap">
              <span className="font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                {resumenTiendaActivaFiltrada.productos} productos
                {resumenTiendaActivaFiltrada.productos !== activePedido.total_productos && (
                  <span className="text-gray-400 ml-1">/ {activePedido.total_productos}</span>
                )}
              </span>
              <span className="text-gray-300">|</span>
              <span className="font-medium">{formatNumber(resumenTiendaActivaFiltrada.bultos)} bultos</span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">{formatNumber(resumenTiendaActivaFiltrada.unidades)} unidades</span>
              {resumenTiendaActivaFiltrada.ajustados > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-amber-600 font-medium">
                    {resumenTiendaActivaFiltrada.ajustados} ajustados por DPD+U
                  </span>
                </>
              )}
              <span className="ml-auto text-gray-500">
                ABC:
                <span className="ml-1 text-green-600">A:{contadores.porABC.A}</span>
                <span className="ml-1 text-yellow-600">B:{contadores.porABC.B}</span>
                <span className="ml-1 text-gray-500">C:{contadores.porABC.C}</span>
              </span>
            </div>
          )}
        </div>

        {/* Tabla de productos */}
        <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
          {activePedido && renderProductTable(activePedido)}
        </div>

        {/* Footer con resumen consolidado */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-600">
                <strong>{resumenConsolidado.totalTiendas}</strong> tiendas
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">
                <strong>{formatNumber(resumenConsolidado.totalProductos)}</strong> productos
              </span>
              <span className="text-gray-300">|</span>
              <span className="font-bold text-gray-900">
                {formatNumber(resumenConsolidado.totalBultos)} bultos
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">
                {formatNumber(resumenConsolidado.totalUnidades)} unidades
              </span>
              {resumenConsolidado.productosAjustados > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-amber-600 font-medium">
                    {resumenConsolidado.productosAjustados} ajustados DPD+U
                  </span>
                </>
              )}
            </div>
            <div className="text-xs text-gray-500">
              DPD+U: {(calculationResult.config_dpdu.peso_demanda * 100).toFixed(0)}% demanda +{' '}
              {(calculationResult.config_dpdu.peso_urgencia * 100).toFixed(0)}% urgencia
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
          className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
        >
          Continuar a Confirmación →
        </button>
      </div>

      {/* Modal de Análisis de Ventas */}
      {selectedProductoSales && (
        <ProductSalesModal
          isOpen={salesModalOpen}
          onClose={() => setSalesModalOpen(false)}
          codigoProducto={selectedProductoSales.codigo_producto}
          descripcionProducto={selectedProductoSales.descripcion_producto}
          currentUbicacionId={selectedTiendaId}
        />
      )}

      {/* Modal de Histórico de Inventario (Tienda) */}
      {selectedProductoHistoricoTienda && (
        <ProductHistoryModal
          isOpen={historicoTiendaModalOpen}
          onClose={() => setHistoricoTiendaModalOpen(false)}
          codigoProducto={selectedProductoHistoricoTienda.codigo_producto}
          descripcionProducto={selectedProductoHistoricoTienda.descripcion_producto}
          ubicacionId={selectedTiendaId}
        />
      )}

      {/* Modal de Histórico de Inventario (CEDI) */}
      {selectedProductoHistoricoCedi && (
        <ProductHistoryModal
          isOpen={historicoCediModalOpen}
          onClose={() => setHistoricoCediModalOpen(false)}
          codigoProducto={selectedProductoHistoricoCedi.codigo_producto}
          descripcionProducto={selectedProductoHistoricoCedi.descripcion_producto}
          ubicacionId={orderData.cedi_origen}
        />
      )}

      {/* Modal de Stock de Seguridad */}
      {selectedProductoSS && (
        <StockSeguridadModal
          isOpen={stockSeguridadModalOpen}
          onClose={() => setStockSeguridadModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoSS.codigo_producto,
            descripcion_producto: selectedProductoSS.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoSS.prom_20dias_unid || selectedProductoSS.prom_p75_unid,
            prom_p75_unid: selectedProductoSS.prom_p75_unid,
            cantidad_bultos: selectedProductoSS.unidades_por_bulto,
            clasificacion_abc: selectedProductoSS.clasificacion_abc || null,
            clase_efectiva: selectedProductoSS.clasificacion_abc || null,
            es_generador_trafico: false,
            stock_seguridad: getStockParams(selectedProductoSS).ss * selectedProductoSS.unidades_por_bulto,
            metodo_calculo: 'estadistico',
          }}
        />
      )}

      {/* Modal de Punto de Reorden (Stock Mínimo) */}
      {selectedProductoROP && (
        <StockMinimoModal
          isOpen={stockMinimoModalOpen}
          onClose={() => setStockMinimoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoROP.codigo_producto,
            descripcion_producto: selectedProductoROP.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoROP.prom_20dias_unid || selectedProductoROP.prom_p75_unid,
            prom_p75_unid: selectedProductoROP.prom_p75_unid,
            cantidad_bultos: selectedProductoROP.unidades_por_bulto,
            clasificacion_abc: selectedProductoROP.clasificacion_abc || null,
            clase_efectiva: selectedProductoROP.clasificacion_abc || null,
            es_generador_trafico: false,
            stock_minimo: getStockParams(selectedProductoROP).rop * selectedProductoROP.unidades_por_bulto,
            stock_seguridad: getStockParams(selectedProductoROP).ss * selectedProductoROP.unidades_por_bulto,
            punto_reorden: getStockParams(selectedProductoROP).rop * selectedProductoROP.unidades_por_bulto,
            metodo_calculo: 'estadistico',
          }}
        />
      )}

      {/* Modal de Stock Máximo */}
      {selectedProductoMAX && (
        <StockMaximoModal
          isOpen={stockMaximoModalOpen}
          onClose={() => setStockMaximoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoMAX.codigo_producto,
            descripcion_producto: selectedProductoMAX.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoMAX.prom_20dias_unid || selectedProductoMAX.prom_p75_unid,
            prom_p75_unid: selectedProductoMAX.prom_p75_unid,
            cantidad_bultos: selectedProductoMAX.unidades_por_bulto,
            clasificacion_abc: selectedProductoMAX.clasificacion_abc || null,
            clase_efectiva: selectedProductoMAX.clasificacion_abc || null,
            es_generador_trafico: false,
            stock_maximo: getStockParams(selectedProductoMAX).max * selectedProductoMAX.unidades_por_bulto,
            punto_reorden: getStockParams(selectedProductoMAX).rop * selectedProductoMAX.unidades_por_bulto,
            metodo_calculo: 'estadistico',
          }}
        />
      )}

      {/* Modal de Criticidad */}
      {selectedProductoCriticidad && (
        <CriticidadModal
          isOpen={criticidadModalOpen}
          onClose={() => setCriticidadModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoCriticidad.codigo_producto,
            descripcion_producto: selectedProductoCriticidad.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoCriticidad.prom_20dias_unid || selectedProductoCriticidad.prom_p75_unid,
            prom_p75_unid: selectedProductoCriticidad.prom_p75_unid,
            cantidad_bultos: selectedProductoCriticidad.unidades_por_bulto,
            stock_tienda: selectedProductoCriticidad.stock_tienda,
            stock_en_transito: selectedProductoCriticidad.stock_en_transito || 0,
            stock_seguridad: getStockParams(selectedProductoCriticidad).ss * selectedProductoCriticidad.unidades_por_bulto,
            punto_reorden: getStockParams(selectedProductoCriticidad).rop * selectedProductoCriticidad.unidades_por_bulto,
            stock_maximo: getStockParams(selectedProductoCriticidad).max * selectedProductoCriticidad.unidades_por_bulto,
            clasificacion_abc: selectedProductoCriticidad.clasificacion_abc || undefined,
          }}
          stockParams={{
            stock_min_mult_a: 3, stock_min_mult_ab: 4, stock_min_mult_b: 5, stock_min_mult_bc: 6, stock_min_mult_c: 8,
            stock_seg_mult_a: 1.5, stock_seg_mult_ab: 2, stock_seg_mult_b: 2.5, stock_seg_mult_bc: 3, stock_seg_mult_c: 4,
            stock_max_mult_a: 5, stock_max_mult_ab: 7, stock_max_mult_b: 10, stock_max_mult_bc: 12, stock_max_mult_c: 15,
          }}
        />
      )}
    </div>
  );
}
