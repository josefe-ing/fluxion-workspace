import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { ProductoInterCedi, TotalesPorCedi, ConfiguracionDiasCobertura } from '../../../services/pedidosInterCediService';
import {
  CEDI_ORIGEN_COLORS,
  CEDI_ORIGEN_NOMBRES,
  ABC_COLORS,
  formatNumber,
  agruparPorCediOrigen,
  calcularTotales
} from '../../../services/pedidosInterCediService';
import DetalleProductoInterCediModal from './DetalleProductoInterCediModal';
import StockCediDestinoModal from './StockCediDestinoModal';
import StockCediOrigenModal from './StockCediOrigenModal';
import CantidadSugeridaModal from './CantidadSugeridaModal';
import StockTiendasModal from './StockTiendasModal';
import PrioridadModal from './PrioridadModal';

interface Props {
  productos: ProductoInterCedi[];
  totalesPorCedi: Record<string, TotalesPorCedi>;
  region: string;
  numTiendasRegion: number;
  config: ConfiguracionDiasCobertura & {
    lead_time_dias: number;
    frecuencia_viajes_dias: string;
  };
  // Exclusiones Inter-CEDI aplicadas
  totalExcluidos?: number;
  codigosExcluidos?: string[];
  // Si se pasa, oculta el filtro de CEDI (orden de un solo CEDI)
  cediOrigenId?: string;
  updateProductos: (productos: ProductoInterCedi[]) => void;
  onNext: () => void;
  onBack: () => void;
  readOnly?: boolean;
}

type SortField = 'demanda' | 'stock_cedi' | 'dias_cedi' | 'stock_origen' | 'sugerido' | 'pedido' | 'abc' | 'prioridad';
type SortDirection = 'asc' | 'desc';

// Helper: calcular días de stock
const calcularDiasStock = (stock: number, demandaDiaria: number): number => {
  if (demandaDiaria <= 0) return 999;
  return stock / demandaDiaria;
};

// Helper: color por días de stock
const getDiasStockColor = (dias: number): string => {
  if (dias <= 3) return 'text-red-600 font-semibold';
  if (dias <= 7) return 'text-yellow-600';
  if (dias <= 14) return 'text-blue-600';
  return 'text-green-600';
};

// Helper: calcular prioridad basada en ABC + días de stock
// Prioridad 1 = más urgente (A con stock crítico), 10 = menos urgente
const calcularPrioridad = (abc: string, diasStock: number): number => {
  // Matriz de prioridades: ABC × Días de stock
  const abcIndex = abc === 'A' ? 0 : abc === 'B' ? 1 : abc === 'C' ? 2 : 3;
  const diasIndex = diasStock <= 3 ? 0 : diasStock <= 7 ? 1 : diasStock <= 14 ? 2 : 3;

  const matriz = [
    [1, 2, 4, 7],   // A: crítico=1, bajo=2, moderado=4, suficiente=7
    [3, 5, 6, 8],   // B: crítico=3, bajo=5, moderado=6, suficiente=8
    [5, 7, 8, 9],   // C: crítico=5, bajo=7, moderado=8, suficiente=9
    [6, 8, 9, 10],  // D: crítico=6, bajo=8, moderado=9, suficiente=10
  ];

  return matriz[abcIndex][diasIndex];
};

// Helper: color y estilo de prioridad
const getPrioridadStyle = (prioridad: number): { bg: string; text: string; border: string } => {
  if (prioridad <= 2) return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' };
  if (prioridad <= 4) return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' };
  if (prioridad <= 6) return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' };
  if (prioridad <= 8) return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' };
  return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
};

export default function PasoSeleccionProductosInterCedi({
  productos,
  totalesPorCedi,
  region,
  numTiendasRegion,
  config,
  totalExcluidos = 0,
  codigosExcluidos = [],
  cediOrigenId,
  updateProductos,
  onNext,
  onBack,
  readOnly = false
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroVista, setFiltroVista] = useState<string>('seleccionados'); // 'seleccionados' | 'no_seleccionados' | 'todos'
  const [filtroCediOrigen, setFiltroCediOrigen] = useState<string>('todos');
  const [filtroABC, setFiltroABC] = useState<string>('todos');
  const [filtroCuadrante, setFiltroCuadrante] = useState<string>('todos');
  const [filtroStockValencia, setFiltroStockValencia] = useState<string>('todos'); // 'con_stock' | 'sin_stock' | 'todos'
  const [filtroStockCaracas, setFiltroStockCaracas] = useState<string>('todos'); // 'con_stock' | 'sin_stock' | 'todos'
  const [sortField, setSortField] = useState<SortField>('prioridad');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [paginaActual, setPaginaActual] = useState(1);
  const productosPorPagina = 50;

  // Estado de los modales
  const [modalP75Open, setModalP75Open] = useState(false);
  const [modalStockCCSOpen, setModalStockCCSOpen] = useState(false);
  const [modalStockOrigenOpen, setModalStockOrigenOpen] = useState(false);
  const [modalSugeridoOpen, setModalSugeridoOpen] = useState(false);
  const [modalStockTiendasOpen, setModalStockTiendasOpen] = useState(false);
  const [modalPrioridadOpen, setModalPrioridadOpen] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoInterCedi | null>(null);

  const handleP75Click = (producto: ProductoInterCedi) => {
    setProductoSeleccionado(producto);
    setModalP75Open(true);
  };

  const handleStockCCSClick = (producto: ProductoInterCedi) => {
    setProductoSeleccionado(producto);
    setModalStockCCSOpen(true);
  };

  const handleStockOrigenClick = (producto: ProductoInterCedi) => {
    setProductoSeleccionado(producto);
    setModalStockOrigenOpen(true);
  };

  const handleSugeridoClick = (producto: ProductoInterCedi) => {
    setProductoSeleccionado(producto);
    setModalSugeridoOpen(true);
  };

  const handleStockTiendasClick = (producto: ProductoInterCedi) => {
    setProductoSeleccionado(producto);
    setModalStockTiendasOpen(true);
  };

  const handlePrioridadClick = (producto: ProductoInterCedi) => {
    setProductoSeleccionado(producto);
    setModalPrioridadOpen(true);
  };

  // Filtrar productos
  const productosFiltrados = useMemo(() => {
    return productos.filter(p => {
      // Filtro de búsqueda (soporta múltiples códigos separados por coma)
      if (searchTerm) {
        // Detectar si es búsqueda múltiple por códigos (contiene comas)
        if (searchTerm.includes(',')) {
          const codigos = searchTerm.split(',').map(c => c.trim()).filter(c => c.length > 0);
          const codigoNormalizado = p.codigo_producto.replace(/^0+/, '');
          const match = codigos.some(codigo => {
            const codigoBuscado = codigo.replace(/^0+/, '');
            return codigoNormalizado === codigoBuscado ||
                   p.codigo_producto === codigo ||
                   p.codigo_producto.endsWith(codigo);
          });
          if (!match) return false;
        } else {
          // Búsqueda normal (texto libre)
          const term = searchTerm.toLowerCase();
          const matchSearch =
            p.codigo_producto.toLowerCase().includes(term) ||
            p.descripcion_producto.toLowerCase().includes(term) ||
            (p.categoria?.toLowerCase().includes(term)) ||
            (p.marca?.toLowerCase().includes(term));
          if (!matchSearch) return false;
        }
      }

      // Filtro por CEDI origen
      if (filtroCediOrigen !== 'todos' && p.cedi_origen_id !== filtroCediOrigen) {
        return false;
      }

      // Filtro por ABC
      if (filtroABC !== 'todos' && p.clasificacion_abc !== filtroABC) {
        return false;
      }

      // Filtro por Cuadrante
      if (filtroCuadrante !== 'todos') {
        const cuadranteProducto = p.cuadrante || 'NO ESPECIFICADO';
        if (cuadranteProducto !== filtroCuadrante) {
          return false;
        }
      }

      // Filtro por Stock en Valencia (Seco, Frío o Verde)
      if (filtroStockValencia !== 'todos') {
        const tieneStockEnValencia = p.stock_cedi_origen > 0;
        if (filtroStockValencia === 'con_stock' && !tieneStockEnValencia) {
          return false;
        }
        if (filtroStockValencia === 'sin_stock' && tieneStockEnValencia) {
          return false;
        }
      }

      // Filtro por Stock en Caracas
      if (filtroStockCaracas !== 'todos') {
        const tieneStockEnCaracas = p.stock_actual_cedi > 0;
        if (filtroStockCaracas === 'con_stock' && !tieneStockEnCaracas) {
          return false;
        }
        if (filtroStockCaracas === 'sin_stock' && tieneStockEnCaracas) {
          return false;
        }
      }

      // Filtro por Vista (seleccionados / no seleccionados / todos)
      if (filtroVista !== 'todos') {
        const cantidadPedida = p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos;
        const isSeleccionado = p.incluido !== false && cantidadPedida > 0;
        if (filtroVista === 'seleccionados' && !isSeleccionado) {
          return false;
        }
        if (filtroVista === 'no_seleccionados' && isSeleccionado) {
          return false;
        }
      }

      return true;
    });
  }, [productos, searchTerm, filtroVista, filtroCediOrigen, filtroABC, filtroCuadrante, filtroStockValencia, filtroStockCaracas]);

  // Ordenar productos
  const productosOrdenados = useMemo(() => {
    return [...productosFiltrados].sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      switch (sortField) {
        case 'demanda':
          // Demanda en bultos/día
          aValue = a.unidades_por_bulto > 0 ? a.demanda_regional_p75 / a.unidades_por_bulto : 0;
          bValue = b.unidades_por_bulto > 0 ? b.demanda_regional_p75 / b.unidades_por_bulto : 0;
          break;
        case 'stock_cedi':
          // Stock CEDI en bultos
          aValue = a.unidades_por_bulto > 0 ? a.stock_actual_cedi / a.unidades_por_bulto : 0;
          bValue = b.unidades_por_bulto > 0 ? b.stock_actual_cedi / b.unidades_por_bulto : 0;
          break;
        case 'dias_cedi':
          aValue = calcularDiasStock(a.stock_actual_cedi, a.demanda_regional_p75);
          bValue = calcularDiasStock(b.stock_actual_cedi, b.demanda_regional_p75);
          break;
        case 'stock_origen':
          // Stock origen en bultos
          aValue = a.unidades_por_bulto > 0 ? a.stock_cedi_origen / a.unidades_por_bulto : 0;
          bValue = b.unidades_por_bulto > 0 ? b.stock_cedi_origen / b.unidades_por_bulto : 0;
          break;
        case 'sugerido':
          aValue = a.cantidad_sugerida_bultos;
          bValue = b.cantidad_sugerida_bultos;
          break;
        case 'pedido':
          aValue = a.cantidad_pedida_bultos ?? a.cantidad_sugerida_bultos;
          bValue = b.cantidad_pedida_bultos ?? b.cantidad_sugerida_bultos;
          break;
        case 'abc': {
          const abcOrder: Record<string, number> = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
          aValue = abcOrder[a.clasificacion_abc || 'D'] || 4;
          bValue = abcOrder[b.clasificacion_abc || 'D'] || 4;
          break;
        }
        case 'prioridad': {
          const diasA = calcularDiasStock(a.stock_actual_cedi, a.demanda_regional_p75);
          const diasB = calcularDiasStock(b.stock_actual_cedi, b.demanda_regional_p75);
          aValue = calcularPrioridad(a.clasificacion_abc || 'D', diasA);
          bValue = calcularPrioridad(b.clasificacion_abc || 'D', diasB);
          break;
        }
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }, [productosFiltrados, sortField, sortDirection]);

  // Paginación
  const totalPaginas = Math.ceil(productosOrdenados.length / productosPorPagina);
  const productosPaginados = productosOrdenados.slice(
    (paginaActual - 1) * productosPorPagina,
    paginaActual * productosPorPagina
  );

  // Totales calculados dinámicamente
  const totalesActuales = useMemo(() => {
    return calcularTotales(productos);
  }, [productos]);

  // Productos agrupados por CEDI para contadores
  const productosAgrupados = useMemo(() => {
    return agruparPorCediOrigen(productos);
  }, [productos]);

  // Cuadrantes únicos para filtro
  const cuadrantesUnicos = useMemo(() => {
    const cuads = new Set(productos.map(p => p.cuadrante || 'NO ESPECIFICADO'));
    return ['todos', ...Array.from(cuads).sort()];
  }, [productos]);

  // Handlers
  const handleCantidadChange = (codigoProducto: string, value: string) => {
    const cantidad = parseInt(value) || 0;
    const nuevosProductos = productos.map(p => {
      if (p.codigo_producto === codigoProducto) {
        return {
          ...p,
          cantidad_pedida_bultos: cantidad,
          total_unidades: cantidad * p.unidades_por_bulto,
          incluido: cantidad > 0
        };
      }
      return p;
    });
    updateProductos(nuevosProductos);
  };

  const handleIncluirChange = (codigoProducto: string, incluido: boolean) => {
    const nuevosProductos = productos.map(p => {
      if (p.codigo_producto === codigoProducto) {
        if (incluido) {
          const cantidadActual = p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos;
          const nuevaCantidad = cantidadActual > 0 ? cantidadActual : 1;
          return { ...p, incluido: true, cantidad_pedida_bultos: nuevaCantidad, total_unidades: nuevaCantidad * p.unidades_por_bulto };
        }
        return { ...p, incluido: false, cantidad_pedida_bultos: 0, total_unidades: 0 };
      }
      return p;
    });
    updateProductos(nuevosProductos);
  };

  const handleNotasChange = (codigoProducto: string, notas: string) => {
    const nuevosProductos = productos.map(p => {
      if (p.codigo_producto === codigoProducto) {
        return { ...p, observaciones: notas };
      }
      return p;
    });
    updateProductos(nuevosProductos);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // Aceptar todas las sugerencias
  const handleAceptarTodas = () => {
    const nuevosProductos = productos.map(p => ({
      ...p,
      cantidad_pedida_bultos: p.cantidad_sugerida_bultos,
      total_unidades: p.cantidad_sugerida_bultos * p.unidades_por_bulto,
      incluido: p.cantidad_sugerida_bultos > 0
    }));
    updateProductos(nuevosProductos);
  };

  // Limpiar todas las cantidades
  const handleLimpiarTodas = () => {
    const nuevosProductos = productos.map(p => ({
      ...p,
      cantidad_pedida_bultos: 0,
      total_unidades: 0,
      incluido: false
    }));
    updateProductos(nuevosProductos);
  };

  // Calcular peso total en toneladas
  const pesoTotalToneladas = useMemo(() => {
    return productos.reduce((sum, p) => {
      if (p.incluido === false) return sum;
      const cantidadPedida = p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos;
      if (cantidadPedida <= 0) return sum;
      const pesoUnitario = p.peso_unitario_kg || 0;
      const pesoTotalKg = cantidadPedida * p.unidades_por_bulto * pesoUnitario;
      return sum + pesoTotalKg;
    }, 0) / 1000;
  }, [productos]);

  // Exportar a Excel
  const handleExportarExcel = () => {
    try {
      const datosExcel = productosOrdenados.map((p, idx) => {
        const unidadesPorBulto = Number(p.unidades_por_bulto) || 1;
        const cantidadPedida = Number(p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) || 0;
        const demandaP75 = Number(p.demanda_regional_p75) || 0;
        const stockCedi = Number(p.stock_actual_cedi) || 0;
        const stockOrigen = Number(p.stock_cedi_origen) || 0;
        const stockTiendas = Number(p.stock_tiendas_total) || 0;
        const demandaBultosDia = demandaP75 / unidadesPorBulto;
        const stockCediBultos = stockCedi / unidadesPorBulto;
        const stockOrigenBultos = stockOrigen / unidadesPorBulto;
        const diasStockCedi = demandaP75 > 0 ? stockCedi / demandaP75 : 999;
        const stockTiendasBultos = stockTiendas / unidadesPorBulto;
        const diasStockTiendas = demandaP75 > 0 ? stockTiendas / demandaP75 : 999;
        const pesoUnitario = Number(p.peso_unitario_kg) || 0;
        const pesoTotalKg = cantidadPedida * unidadesPorBulto * pesoUnitario;
        const prioridad = calcularPrioridad(p.clasificacion_abc || 'D', diasStockCedi);

        return {
          '#': idx + 1,
          'Incluido': (p.incluido !== false && cantidadPedida > 0) ? 'Si' : 'No',
          'CEDI Origen': CEDI_ORIGEN_NOMBRES[p.cedi_origen_id] || p.cedi_origen_id,
          'Código': p.codigo_producto,
          'Cód. Barras': p.codigo_barras || '',
          'Producto': p.descripcion_producto,
          'Categoría': p.categoria || '',
          'Marca': p.marca || '',
          'U/B': unidadesPorBulto,
          'ABC': p.clasificacion_abc || 'D',
          'Cuadrante': p.cuadrante || '',
          'Stock Origen (bultos)': Math.round(stockOrigenBultos),
          'Stock Origen (unid)': stockOrigen,
          'Stock CCS (bultos)': Math.round(stockCediBultos),
          'Stock CCS (unid)': stockCedi,
          'Días Stock CCS': diasStockCedi >= 999 ? '' : Math.round(diasStockCedi),
          'Stock Tiendas (bultos)': Math.round(stockTiendasBultos),
          'Stock Tiendas (unid)': stockTiendas,
          'Días Stock Tiendas': diasStockTiendas >= 999 ? '' : Math.round(diasStockTiendas),
          'P75 (bultos/día)': Number(demandaBultosDia.toFixed(2)),
          'P75 (unid/día)': Number(demandaP75.toFixed(2)),
          'Prioridad': prioridad,
          'Sugerido (bultos)': Number(p.cantidad_sugerida_bultos) || 0,
          'A Pedir (bultos)': cantidadPedida,
          'Peso (Kg)': pesoTotalKg > 0 ? Number(pesoTotalKg.toFixed(2)) : '',
          'Notas': p.observaciones || ''
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(datosExcel);

      // Ajustar ancho de columnas
      ws['!cols'] = [
        { wch: 5 },   // #
        { wch: 8 },   // Incluido
        { wch: 12 },  // CEDI Origen
        { wch: 10 },  // Código
        { wch: 16 },  // Cód. Barras
        { wch: 45 },  // Producto
        { wch: 18 },  // Categoría
        { wch: 15 },  // Marca
        { wch: 5 },   // U/B
        { wch: 5 },   // ABC
        { wch: 12 },  // Cuadrante
        { wch: 14 },  // Stock Origen bultos
        { wch: 14 },  // Stock Origen unid
        { wch: 14 },  // Stock CCS bultos
        { wch: 14 },  // Stock CCS unid
        { wch: 14 },  // Días Stock CCS
        { wch: 14 },  // Stock Tiendas bultos
        { wch: 14 },  // Stock Tiendas unid
        { wch: 16 },  // Días Stock Tiendas
        { wch: 14 },  // P75 bultos/día
        { wch: 14 },  // P75 unid/día
        { wch: 10 },  // Prioridad
        { wch: 14 },  // Sugerido
        { wch: 14 },  // A Pedir
        { wch: 12 },  // Peso
        { wch: 20 },  // Notas
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Pedido Inter-CEDI');
      const fecha = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Pedido_InterCEDI_${region}_${fecha}.xlsx`);
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      alert('Error al exportar a Excel. Revise la consola para más detalles.');
    }
  };

  const canProceed = totalesActuales.totalProductos > 0;

  return (
    <div className="space-y-4">
      {/* Header con info de región */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Selección de Productos Inter-CEDI</h2>
            <p className="text-sm text-gray-500">
              Región {region} - {numTiendasRegion} tiendas - Demanda agregada P75
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleExportarExcel}
              className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 border border-green-200"
            >
              Excel
            </button>
            {!readOnly && (
              <>
                <button
                  onClick={handleAceptarTodas}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100"
                >
                  Aceptar Sugeridas
                </button>
                <button
                  onClick={handleLimpiarTodas}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Limpiar Todo
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Banner de productos excluidos */}
      {totalExcluidos > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <span className="text-sm font-medium text-amber-800">
                {totalExcluidos} producto{totalExcluidos !== 1 ? 's' : ''} excluido{totalExcluidos !== 1 ? 's' : ''} de este pedido Inter-CEDI
              </span>
              <span className="text-xs text-amber-600 ml-2">
                (configurado en Administrador → Exclusiones Inter-CEDI)
              </span>
            </div>
            {codigosExcluidos.length > 0 && codigosExcluidos.length <= 10 && (
              <div className="text-xs text-amber-700">
                Códigos: {codigosExcluidos.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtros y Totales por CEDI */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPaginaActual(1); }}
              placeholder="Buscar por código, nombre, categoría..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Filtro Vista (Seleccionados / No seleccionados / Todos) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Vista:</span>
            <select
              value={filtroVista}
              onChange={(e) => { setFiltroVista(e.target.value); setPaginaActual(1); }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="seleccionados">
                ✓ Seleccionados ({productos.filter(p => {
                  const cantidad = p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos;
                  return p.incluido !== false && cantidad > 0;
                }).length})
              </option>
              <option value="no_seleccionados">
                No seleccionados ({productos.filter(p => {
                  const cantidad = p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos;
                  return !(p.incluido !== false && cantidad > 0);
                }).length})
              </option>
              <option value="todos">
                Todos ({productos.length})
              </option>
            </select>
          </div>

          {/* Filtro CEDI Origen — oculto cuando el pedido ya es de un solo CEDI */}
          {!cediOrigenId && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">CEDI:</span>
              <select
                value={filtroCediOrigen}
                onChange={(e) => { setFiltroCediOrigen(e.target.value); setPaginaActual(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="todos">Todos los CEDIs</option>
                <option value="cedi_seco">CEDI Seco ({productosAgrupados.cedi_seco.length})</option>
                <option value="cedi_frio">CEDI Frío ({productosAgrupados.cedi_frio.length})</option>
                <option value="cedi_verde">CEDI Verde ({productosAgrupados.cedi_verde.length})</option>
              </select>
            </div>
          )}

          {/* Filtro ABC */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">ABC:</span>
            <select
              value={filtroABC}
              onChange={(e) => { setFiltroABC(e.target.value); setPaginaActual(1); }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="todos">Todas</option>
              <option value="A">Clase A</option>
              <option value="B">Clase B</option>
              <option value="C">Clase C</option>
              <option value="D">Clase D</option>
            </select>
          </div>

          {/* Filtro Cuadrante */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Cuad:</span>
            <select
              value={filtroCuadrante}
              onChange={(e) => { setFiltroCuadrante(e.target.value); setPaginaActual(1); }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {cuadrantesUnicos.map(cuad => {
                const count = productos.filter(p => (p.cuadrante || 'NO ESPECIFICADO') === cuad || cuad === 'todos').length;
                const displayName = cuad === 'todos' ? 'Todos' : cuad.replace('CUADRANTE ', '');
                return (
                  <option key={cuad} value={cuad}>
                    {displayName} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Filtro Stock Valencia */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Stock VLC:</span>
            <select
              value={filtroStockValencia}
              onChange={(e) => { setFiltroStockValencia(e.target.value); setPaginaActual(1); }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="todos">Todos ({productos.length})</option>
              <option value="con_stock">Con stock ({productos.filter(p => p.stock_cedi_origen > 0).length})</option>
              <option value="sin_stock">Sin stock ({productos.filter(p => p.stock_cedi_origen === 0).length})</option>
            </select>
          </div>

          {/* Filtro Stock Caracas */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Stock CCS:</span>
            <select
              value={filtroStockCaracas}
              onChange={(e) => { setFiltroStockCaracas(e.target.value); setPaginaActual(1); }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="todos">Todos ({productos.length})</option>
              <option value="con_stock">Con stock ({productos.filter(p => p.stock_actual_cedi > 0).length})</option>
              <option value="sin_stock">Sin stock ({productos.filter(p => p.stock_actual_cedi === 0).length})</option>
            </select>
          </div>
        </div>

        {/* Totales por CEDI */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {/* Total General */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Total General</div>
            <div className="text-lg font-bold text-gray-900">{formatNumber(totalesActuales.totalProductos)} productos</div>
            <div className="text-sm text-gray-600">{formatNumber(totalesActuales.totalBultos)} bultos</div>
            <div className="text-sm text-gray-600 font-medium">{formatNumber(pesoTotalToneladas, 2)} ton</div>
          </div>

          {/* CEDI Seco */}
          <div className={`rounded-lg p-3 border ${CEDI_ORIGEN_COLORS.cedi_seco}`}>
            <div className="text-xs mb-1">CEDI Seco</div>
            <div className="text-lg font-bold">{formatNumber(totalesPorCedi.cedi_seco?.productos || 0)} prod.</div>
            <div className="text-sm">{formatNumber(totalesPorCedi.cedi_seco?.bultos || 0)} bultos</div>
          </div>

          {/* CEDI Frío */}
          <div className={`rounded-lg p-3 border ${CEDI_ORIGEN_COLORS.cedi_frio}`}>
            <div className="text-xs mb-1">CEDI Frío</div>
            <div className="text-lg font-bold">{formatNumber(totalesPorCedi.cedi_frio?.productos || 0)} prod.</div>
            <div className="text-sm">{formatNumber(totalesPorCedi.cedi_frio?.bultos || 0)} bultos</div>
          </div>

          {/* CEDI Verde */}
          <div className={`rounded-lg p-3 border ${CEDI_ORIGEN_COLORS.cedi_verde}`}>
            <div className="text-xs mb-1">CEDI Verde</div>
            <div className="text-lg font-bold">{formatNumber(totalesPorCedi.cedi_verde?.productos || 0)} prod.</div>
            <div className="text-sm">{formatNumber(totalesPorCedi.cedi_verde?.bultos || 0)} bultos</div>
          </div>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              {/* Fila de grupos */}
              <tr>
                <th colSpan={7} className="bg-gray-100 px-1 py-1 text-center text-xs font-semibold text-gray-600 uppercase border-b border-gray-300">
                  Producto
                </th>
                <th className="bg-amber-100 px-1 py-1 text-center text-xs font-semibold text-amber-700 uppercase border-b border-amber-300">
                  Origen
                </th>
                <th colSpan={5} className="bg-emerald-100 px-1 py-1 text-center text-xs font-semibold text-emerald-700 uppercase border-b border-emerald-300">
                  Stock Tiendas / CEDI Caracas
                </th>
                <th colSpan={5} className="bg-violet-100 px-1 py-1 text-center text-xs font-semibold text-violet-700 uppercase border-b border-violet-300">
                  Pedido
                </th>
              </tr>
              {/* Fila de columnas */}
              <tr className="bg-gray-50">
                <th className="px-1 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-7">
                  <input
                    type="checkbox"
                    checked={productosPaginados.every(p => p.incluido !== false)}
                    onChange={(e) => {
                      const nuevosProductos = productos.map(p => {
                        if (productosPaginados.find(pf => pf.codigo_producto === p.codigo_producto)) {
                          return { ...p, incluido: e.target.checked };
                        }
                        return p;
                      });
                      updateProductos(nuevosProductos);
                    }}
                    className="h-4 w-4 text-gray-900 border-gray-300 rounded"
                  />
                </th>
                <th className="px-1 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  CEDI
                </th>
                <th className="px-1 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Código
                </th>
                <th className="px-1 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                  Cód.Barras
                </th>
                <th className="px-1 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">
                  Producto
                </th>
                <th className="px-1 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  U/B
                </th>
                <th
                  className="px-1 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-12"
                  onClick={() => handleSort('abc')}
                >
                  ABC {getSortIcon('abc')}
                </th>
                <th
                  className="bg-amber-50 px-1 py-1.5 text-center text-xs font-medium text-amber-700 uppercase whitespace-nowrap cursor-pointer hover:bg-amber-100"
                  onClick={() => handleSort('stock_origen')}
                  title="Stock CEDI Origen en bultos"
                >
                  Stk Orig {getSortIcon('stock_origen')}
                </th>
                <th
                  className="bg-emerald-50 px-1 py-1.5 text-center text-xs font-medium text-emerald-700 uppercase whitespace-nowrap cursor-pointer hover:bg-emerald-100"
                  onClick={() => handleSort('stock_cedi')}
                  title="Stock CEDI Caracas en bultos"
                >
                  Stk CCS {getSortIcon('stock_cedi')}
                </th>
                <th
                  className="bg-emerald-50 px-1 py-1.5 text-center text-xs font-medium text-emerald-700 uppercase whitespace-nowrap cursor-pointer hover:bg-emerald-100"
                  onClick={() => handleSort('dias_cedi')}
                  title="Días de stock en CEDI Caracas"
                >
                  D.CCS {getSortIcon('dias_cedi')}
                </th>
                <th
                  className="bg-emerald-50 px-1 py-1.5 text-center text-xs font-medium text-emerald-700 uppercase whitespace-nowrap"
                  title="Stock en Tiendas de la región"
                >
                  Stk Tda
                </th>
                <th
                  className="bg-emerald-50 px-1 py-1.5 text-center text-xs font-medium text-emerald-700 uppercase whitespace-nowrap"
                  title="Días de stock en Tiendas"
                >
                  D.Tda
                </th>
                <th
                  className="bg-emerald-50 px-1 py-1.5 text-center text-xs font-medium text-emerald-700 uppercase whitespace-nowrap cursor-pointer hover:bg-emerald-100"
                  onClick={() => handleSort('demanda')}
                  title="Demanda P75 regional en bultos/día"
                >
                  P75 {getSortIcon('demanda')}
                </th>
                <th
                  className="bg-violet-50 px-1 py-1.5 text-center text-xs font-medium text-violet-700 uppercase tracking-wider cursor-pointer hover:bg-violet-100 w-10"
                  onClick={() => handleSort('prioridad')}
                  title="Prioridad de reposición (1=más urgente)"
                >
                  Pri {getSortIcon('prioridad')}
                </th>
                <th
                  className="bg-violet-50 px-1 py-1.5 text-center text-xs font-medium text-violet-700 uppercase tracking-wider cursor-pointer hover:bg-violet-100 w-16"
                  onClick={() => handleSort('sugerido')}
                >
                  Sugerido {getSortIcon('sugerido')}
                </th>
                <th className="bg-violet-50 px-1 py-1.5 text-center text-xs font-medium text-violet-700 uppercase tracking-wider w-16">
                  A Pedir
                </th>
                <th className="bg-violet-50 px-1 py-1.5 text-center text-xs font-medium text-violet-700 uppercase tracking-wider w-16">
                  Peso
                </th>
                <th className="bg-violet-50 px-1 py-1.5 text-center text-xs font-medium text-violet-700 uppercase tracking-wider w-24">
                  Notas
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productosPaginados.map((producto) => {
                const cediColor = CEDI_ORIGEN_COLORS[producto.cedi_origen_id] || CEDI_ORIGEN_COLORS.cedi_seco;
                const abcColor = ABC_COLORS[producto.clasificacion_abc || 'D'] || ABC_COLORS.D;
                const cantidadPedida = producto.cantidad_pedida_bultos ?? producto.cantidad_sugerida_bultos;
                const isIncluido = producto.incluido !== false && cantidadPedida > 0;

                // Calcular valores en bultos
                const unidadesPorBulto = producto.unidades_por_bulto || 1;
                const demandaBultosDia = producto.demanda_regional_p75 / unidadesPorBulto;
                const stockCediBultos = producto.stock_actual_cedi / unidadesPorBulto;
                const stockOrigenBultos = producto.stock_cedi_origen / unidadesPorBulto;
                const diasStockCedi = calcularDiasStock(producto.stock_actual_cedi, producto.demanda_regional_p75);

                return (
                  <tr
                    key={producto.codigo_producto}
                    className={`hover:bg-gray-50 ${!isIncluido ? 'opacity-50' : ''}`}
                  >
                    <td className="px-1 py-1 w-7">
                      <input
                        type="checkbox"
                        checked={isIncluido}
                        onChange={(e) => handleIncluirChange(producto.codigo_producto, e.target.checked)}
                        className="h-4 w-4 text-gray-900 border-gray-300 rounded"
                        disabled={readOnly}
                      />
                    </td>
                    <td className="px-1 py-1 w-12">
                      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium border ${cediColor}`}>
                        {CEDI_ORIGEN_NOMBRES[producto.cedi_origen_id]?.replace('CEDI ', '') || 'Seco'}
                      </span>
                    </td>
                    <td className="px-1 py-1 text-xs text-gray-600 font-mono w-16">
                      {producto.codigo_producto}
                    </td>
                    <td className="px-1 py-1 text-xs text-gray-500 font-mono w-28">
                      {producto.codigo_barras || '-'}
                    </td>
                    <td className="px-1 py-1 w-64 max-w-64">
                      <div className="text-xs text-gray-900 leading-tight truncate" title={producto.descripcion_producto}>
                        {producto.descripcion_producto}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {producto.categoria} {producto.marca && `· ${producto.marca}`}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center w-10">
                      <span className="text-xs text-gray-900 font-medium block">{unidadesPorBulto}</span>
                      <span className="text-[10px] text-gray-500 block">{producto.unidad_pedido || 'Bulto'}</span>
                    </td>
                    <td className="px-1 py-1 text-center w-12">
                      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold ${abcColor}`}>
                        {producto.clasificacion_abc || 'D'}
                      </span>
                    </td>
                    {/* Stock Origen */}
                    <td className="bg-amber-50 px-1 py-1 text-center text-xs text-gray-900 w-16">
                      <button
                        onClick={() => handleStockOrigenClick(producto)}
                        className="hover:text-amber-700 hover:underline cursor-pointer transition-colors w-full"
                        title="Click para ver detalle de stock CEDI Origen"
                      >
                        <span className="font-medium block">{formatNumber(stockOrigenBultos, 0)}</span>
                        <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_cedi_origen, 0)}u</span>
                      </button>
                    </td>
                    {/* Stock CEDI Caracas */}
                    <td className="bg-emerald-50 px-1 py-1 text-center text-xs text-gray-900 w-16">
                      <button
                        onClick={() => handleStockCCSClick(producto)}
                        className="hover:text-emerald-700 hover:underline cursor-pointer transition-colors w-full"
                        title="Click para ver detalle de stock CEDI Caracas"
                      >
                        <span className="font-medium block">{formatNumber(stockCediBultos, 0)}</span>
                        <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_actual_cedi, 0)}u</span>
                      </button>
                    </td>
                    {/* Días Stock CEDI Caracas */}
                    <td className="bg-emerald-50 px-1 py-1 text-center w-12">
                      <button
                        onClick={() => handleStockCCSClick(producto)}
                        className={`text-xs ${getDiasStockColor(diasStockCedi)} hover:underline cursor-pointer`}
                        title="Click para ver detalle de días de stock CEDI"
                      >
                        {diasStockCedi >= 999 ? '-' : `${formatNumber(diasStockCedi, 0)} d`}
                      </button>
                    </td>
                    {/* Stock Tiendas */}
                    <td className="bg-emerald-50 px-1 py-1 text-center text-xs text-gray-900 w-16">
                      <button
                        onClick={() => handleStockTiendasClick(producto)}
                        className="hover:text-emerald-700 hover:underline cursor-pointer transition-colors w-full"
                        title="Click para ver detalle de stock en tiendas"
                      >
                        <span className="font-medium block">{formatNumber((producto.stock_tiendas_total || 0) / unidadesPorBulto, 0)}</span>
                        <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_tiendas_total || 0, 0)}u</span>
                      </button>
                    </td>
                    {/* Días Stock Tiendas */}
                    <td className="bg-emerald-50 px-1 py-1 text-center w-12">
                      {(() => {
                        const stockTiendasUnid = producto.stock_tiendas_total || 0;
                        const diasStockTiendas = producto.demanda_regional_p75 > 0 ? stockTiendasUnid / producto.demanda_regional_p75 : 999;
                        return (
                          <button
                            onClick={() => handleStockTiendasClick(producto)}
                            className={`text-xs ${getDiasStockColor(diasStockTiendas)} hover:underline cursor-pointer`}
                            title="Días de stock en tiendas"
                          >
                            {diasStockTiendas >= 999 ? '-' : `${formatNumber(diasStockTiendas, 0)} d`}
                          </button>
                        );
                      })()}
                    </td>
                    {/* P75 Demanda */}
                    <td className="bg-emerald-50 px-1 py-1 text-center text-xs text-gray-900 w-16">
                      <button
                        onClick={() => handleP75Click(producto)}
                        className="hover:text-emerald-700 hover:underline cursor-pointer transition-colors w-full"
                        title="Click para ver detalle de cálculo P75"
                      >
                        <span className="font-medium block">{formatNumber(demandaBultosDia, 2)}</span>
                        <span className="text-[10px] text-gray-500 block">{formatNumber(producto.demanda_regional_p75, 0)}u</span>
                      </button>
                    </td>
                    {/* Prioridad - en grupo Pedido */}
                    <td className="bg-violet-50 px-1 py-1 text-center w-10">
                      {(() => {
                        const prioridad = calcularPrioridad(producto.clasificacion_abc || 'D', diasStockCedi);
                        const prioridadStyle = getPrioridadStyle(prioridad);
                        return (
                          <button
                            onClick={() => handlePrioridadClick(producto)}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all ${prioridadStyle.bg} ${prioridadStyle.text} ${prioridadStyle.border}`}
                            title={`Click para ver detalle - Prioridad ${prioridad} de 10`}
                          >
                            {prioridad}
                          </button>
                        );
                      })()}
                    </td>
                    {/* Sugerido */}
                    <td className="bg-violet-50 px-1 py-1 text-center text-xs font-medium text-gray-900 w-16">
                      <button
                        onClick={() => handleSugeridoClick(producto)}
                        className="hover:text-violet-700 hover:underline cursor-pointer transition-colors"
                        title="Click para ver detalle del cálculo"
                      >
                        <span className="block">{formatNumber(producto.cantidad_sugerida_bultos)}</span>
                        {producto.cantidad_sugerida_unidades > 0 && producto.demanda_regional_p75 > 0 && (
                          <span className="text-[10px] text-orange-600 block">
                            ~{formatNumber(producto.cantidad_sugerida_unidades / producto.demanda_regional_p75, 0)}d
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="bg-violet-50 px-1 py-1 w-16">
                      <input
                        type="number"
                        min="0"
                        value={cantidadPedida}
                        onChange={(e) => handleCantidadChange(producto.codigo_producto, e.target.value)}
                        className={`w-14 px-1 py-0.5 border border-gray-300 rounded text-center text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 ${readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        readOnly={readOnly}
                      />
                    </td>
                    {/* Peso */}
                    <td className="bg-violet-50 px-1 py-1 text-center text-xs text-gray-600 w-16 whitespace-nowrap">
                      {(() => {
                        const pesoUnitario = producto.peso_unitario_kg || 0;
                        const pesoTotalKg = cantidadPedida * unidadesPorBulto * pesoUnitario;
                        if (pesoTotalKg <= 0) return '-';
                        if (pesoTotalKg >= 1000) {
                          return `${formatNumber(pesoTotalKg / 1000, 2)} Ton`;
                        }
                        return `${formatNumber(pesoTotalKg, 2)} Kg`;
                      })()}
                    </td>
                    {/* Notas */}
                    <td className="bg-violet-50 px-1 py-1 w-24">
                      <input
                        type="text"
                        value={producto.observaciones || ''}
                        onChange={(e) => handleNotasChange(producto.codigo_producto, e.target.value)}
                        placeholder="Notas..."
                        className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Mostrando {((paginaActual - 1) * productosPorPagina) + 1} - {Math.min(paginaActual * productosPorPagina, productosOrdenados.length)} de {productosOrdenados.length} productos
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {paginaActual} de {totalPaginas}
              </span>
              <button
                onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botones de navegación */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
        >
          ← Volver
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Continuar →
        </button>
      </div>

      {/* Modal de P75 - Desglose por tienda */}
      {productoSeleccionado && (
        <DetalleProductoInterCediModal
          isOpen={modalP75Open}
          onClose={() => setModalP75Open(false)}
          producto={productoSeleccionado}
          config={config}
          numTiendasRegion={numTiendasRegion}
        />
      )}

      {/* Modal de Stock CEDI Caracas */}
      {productoSeleccionado && (
        <StockCediDestinoModal
          isOpen={modalStockCCSOpen}
          onClose={() => setModalStockCCSOpen(false)}
          producto={productoSeleccionado}
          cediDestinoNombre="CEDI Caracas"
        />
      )}

      {/* Modal de Stock CEDI Origen */}
      {productoSeleccionado && (
        <StockCediOrigenModal
          isOpen={modalStockOrigenOpen}
          onClose={() => setModalStockOrigenOpen(false)}
          producto={productoSeleccionado}
        />
      )}

      {/* Modal de Cantidad Sugerida */}
      {productoSeleccionado && (
        <CantidadSugeridaModal
          isOpen={modalSugeridoOpen}
          onClose={() => setModalSugeridoOpen(false)}
          producto={productoSeleccionado}
          config={config}
        />
      )}

      {/* Modal de Stock en Tiendas */}
      {productoSeleccionado && (
        <StockTiendasModal
          isOpen={modalStockTiendasOpen}
          onClose={() => setModalStockTiendasOpen(false)}
          producto={productoSeleccionado}
        />
      )}

      {/* Modal de Prioridad */}
      {productoSeleccionado && (
        <PrioridadModal
          isOpen={modalPrioridadOpen}
          onClose={() => setModalPrioridadOpen(false)}
          producto={productoSeleccionado}
        />
      )}
    </div>
  );
}
