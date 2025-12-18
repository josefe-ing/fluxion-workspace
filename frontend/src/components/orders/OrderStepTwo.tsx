import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import ProductSalesModal from '../sales/ProductSalesModal';
import ABCComparisonModal from './ABCComparisonModal';
import StockMinimoModal from './StockMinimoModal';
import StockSeguridadModal from './StockSeguridadModal';
import StockMaximoModal from './StockMaximoModal';
import StockDiasModal from './StockDiasModal';
import PedidoSugeridoModal from './PedidoSugeridoModal';
import CoberturaRealModal from './CoberturaRealModal';
import MetodosPromedioModal from './MetodosPromedioModal';
import CriticidadModal from './CriticidadModal';
import ModalAnalisisComparativo from './ModalAnalisisComparativo';
import ProductHistoryModal from '../dashboard/ProductHistoryModal';
import { formatNumber } from '../../utils/formatNumber';
import { generarAnalisisXYZDummy, type AnalisisXYZ } from '../../utils/analisisXYZDummy';
import { obtenerAnalisisXYZBatch } from '../../services/analisisXYZ';

interface Props {
  orderData: OrderData;
  updateOrderData: (data: Partial<OrderData>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SortField = 'prom_20d' | 'stock' | 'stock_transito' | 'stock_total' | 'stock_dias' | 'stock_cedi' | 'sugerido' | 'pedir' | 'abc' | 'criticidad' | 'top3' | 'p75' | 'ss' | 'rop' | 'max';
type SortDirection = 'asc' | 'desc';

interface StockParams {
  stock_min_mult_a: number;
  stock_min_mult_ab: number;
  stock_min_mult_b: number;
  stock_min_mult_bc: number;
  stock_min_mult_c: number;
  stock_seg_mult_a: number;
  stock_seg_mult_ab: number;
  stock_seg_mult_b: number;
  stock_seg_mult_bc: number;
  stock_seg_mult_c: number;
  stock_max_mult_a: number;
  stock_max_mult_ab: number;
  stock_max_mult_b: number;
  stock_max_mult_bc: number;
  stock_max_mult_c: number;
}

export default function OrderStepTwo({ orderData, updateOrderData, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [productos, setProductos] = useState<ProductoPedido[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField | null>('criticidad');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [stockParams, setStockParams] = useState<StockParams | null>(null);
  // forecastData eliminado - reemplazado por TOP3 y P75 del backend
  const [cuadranteActivo, setCuadranteActivo] = useState<string>('Todos');
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todas');
  const [vistaActiva, setVistaActiva] = useState<'seleccionados' | 'no_seleccionados' | 'todos'>('seleccionados');
  const [filtroCedi, setFiltroCedi] = useState<'todos' | 'con_stock' | 'sin_stock'>('todos');
  const [filtroPrioridad, setFiltroPrioridad] = useState<'todas' | 'critico' | 'urgente' | 'optimo' | 'exceso'>('todas');
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [selectedProductoSales, setSelectedProductoSales] = useState<ProductoPedido | null>(null);
  const [abcModalOpen, setAbcModalOpen] = useState(false);
  const [selectedProductoABC, setSelectedProductoABC] = useState<ProductoPedido | null>(null);
  const [stockMinimoModalOpen, setStockMinimoModalOpen] = useState(false);
  const [selectedProductoStockMin, setSelectedProductoStockMin] = useState<ProductoPedido | null>(null);
  const [stockSeguridadModalOpen, setStockSeguridadModalOpen] = useState(false);
  const [selectedProductoStockSeg, setSelectedProductoStockSeg] = useState<ProductoPedido | null>(null);
  const [stockMaximoModalOpen, setStockMaximoModalOpen] = useState(false);
  const [selectedProductoStockMax, setSelectedProductoStockMax] = useState<ProductoPedido | null>(null);
  const [stockDiasModalOpen, setStockDiasModalOpen] = useState(false);
  const [selectedProductoDias, setSelectedProductoDias] = useState<ProductoPedido | null>(null);
  const [pedidoSugeridoModalOpen, setPedidoSugeridoModalOpen] = useState(false);
  const [selectedProductoPedido, setSelectedProductoPedido] = useState<ProductoPedido | null>(null);
  // Estados para modal de Cobertura Real V2
  const [coberturaRealModalOpen, setCoberturaRealModalOpen] = useState(false);
  const [selectedProductoCobertura, setSelectedProductoCobertura] = useState<ProductoPedido | null>(null);
  // Estados para modal de métodos de promedio (TOP3 vs P75)
  const [metodosPromedioModalOpen, setMetodosPromedioModalOpen] = useState(false);
  const [selectedProductoMetodos, setSelectedProductoMetodos] = useState<ProductoPedido | null>(null);
  const [criticidadModalOpen, setCriticidadModalOpen] = useState(false);
  const [selectedProductoCriticidad, setSelectedProductoCriticidad] = useState<ProductoPedido | null>(null);
  // Estado para modal de histórico de inventario (tienda)
  const [historicoInventarioModalOpen, setHistoricoInventarioModalOpen] = useState(false);
  const [selectedProductoHistorico, setSelectedProductoHistorico] = useState<ProductoPedido | null>(null);
  // Estado para modal de histórico de inventario (CEDI)
  const [historicoCediModalOpen, setHistoricoCediModalOpen] = useState(false);
  const [selectedProductoCedi, setSelectedProductoCedi] = useState<ProductoPedido | null>(null);

  // Estados para Modo Consultor IA (deshabilitado por ahora)
  const [modoConsultorActivo] = useState(false);
  const [analisisComparativoModalOpen, setAnalisisComparativoModalOpen] = useState(false);
  const [selectedProductoComparativo, setSelectedProductoComparativo] = useState<ProductoPedido | null>(null);
  const [analisisXYZCargando, setAnalisisXYZCargando] = useState(false);
  const [analisisXYZReal, setAnalisisXYZReal] = useState<Record<string, AnalisisXYZ>>({});
  const [usarDatosReales, setUsarDatosReales] = useState(true); // true = API real, false = dummy

  // Config de días de cobertura por clase ABC (para modales)
  const [configDiasCobertura, setConfigDiasCobertura] = useState<{ clase_a: number; clase_b: number; clase_c: number } | null>(null);

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const productosPorPagina = 100;

  useEffect(() => {
    cargarStockParams();
    cargarConfigABC();
    if (orderData.productos.length > 0) {
      setProductos(orderData.productos);
    } else {
      cargarProductosSugeridos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useEffect de forecast eliminado - reemplazado por TOP3 y P75 del backend

  // Ajustar cuadrante activo si no existe en los productos cargados
  useEffect(() => {
    if (productos.length > 0) {
      const cuadrantes = Array.from(new Set(productos.map(p => p.cuadrante_producto).filter(Boolean)));
      if (!cuadrantes.includes(cuadranteActivo) && cuadranteActivo !== 'Todos') {
        // Si CUADRANTE I existe, seleccionarlo, sino usar el primero disponible
        if (cuadrantes.includes('CUADRANTE I')) {
          setCuadranteActivo('CUADRANTE I');
        } else if (cuadrantes.length > 0) {
          setCuadranteActivo(cuadrantes[0] as string);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos]);

  // Actualizar cantidad_pedida_bultos con el pedido sugerido cuando stockParams esté disponible
  useEffect(() => {
    if (stockParams && productos.length > 0) {
      // Solo actualizar si hay productos sin cantidad_pedida_bultos definida (undefined)
      // NO recalcular si el usuario puso 0 manualmente
      const needsUpdate = productos.some(p => p.cantidad_pedida_bultos === undefined);

      if (needsUpdate) {
        const productosActualizados = productos.map(p => {
          // Solo calcular si no está definido, de lo contrario preservar el valor del usuario
          const pedidoSugerido = p.cantidad_pedida_bultos !== undefined ? p.cantidad_pedida_bultos : calcularPedidoSugerido(p);
          return {
            ...p,
            cantidad_pedida_bultos: pedidoSugerido,
            // Solo preseleccionar si el pedido sugerido es > 0
            incluido: pedidoSugerido > 0
          };
        });

        setProductos(productosActualizados);
        updateOrderData({ productos: productosActualizados });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockParams, productos.length]);

  // cargarForecast eliminado - reemplazado por TOP3 y P75 del backend

  const handleVentasClick = (producto: ProductoPedido) => {
    setSelectedProductoSales(producto);
    setSalesModalOpen(true);
  };

  const handleABCClick = (producto: ProductoPedido) => {
    setSelectedProductoABC(producto);
    setAbcModalOpen(true);
  };

  const handleStockMinimoClick = (producto: ProductoPedido) => {
    setSelectedProductoStockMin(producto);
    setStockMinimoModalOpen(true);
  };

  const handleStockSeguridadClick = (producto: ProductoPedido) => {
    setSelectedProductoStockSeg(producto);
    setStockSeguridadModalOpen(true);
  };

  const handleStockMaximoClick = (producto: ProductoPedido) => {
    setSelectedProductoStockMax(producto);
    setStockMaximoModalOpen(true);
  };

  const handleStockDiasClick = (producto: ProductoPedido) => {
    setSelectedProductoDias(producto);
    setStockDiasModalOpen(true);
  };

  const handlePedidoSugeridoClick = (producto: ProductoPedido) => {
    setSelectedProductoPedido(producto);
    setPedidoSugeridoModalOpen(true);
  };

  const handleCoberturaRealClick = (producto: ProductoPedido) => {
    setSelectedProductoCobertura(producto);
    setCoberturaRealModalOpen(true);
  };

  const handleMetodosPromedioClick = (producto: ProductoPedido) => {
    setSelectedProductoMetodos(producto);
    setMetodosPromedioModalOpen(true);
  };

  const handleCriticidadClick = (producto: ProductoPedido) => {
    setSelectedProductoCriticidad(producto);
    setCriticidadModalOpen(true);
  };

  const handleHistoricoInventarioClick = (producto: ProductoPedido) => {
    setSelectedProductoHistorico(producto);
    setHistoricoInventarioModalOpen(true);
  };

  const handleHistoricoCediClick = (producto: ProductoPedido) => {
    setSelectedProductoCedi(producto);
    setHistoricoCediModalOpen(true);
  };

  const cargarStockParams = async () => {
    try {
      const response = await http.get(`/api/ubicaciones/${orderData.tienda_destino}/stock-params`);
      setStockParams(response.data);
    } catch (error) {
      console.error('Error cargando parámetros de stock:', error);
      // Usar valores por defecto
      setStockParams({
        stock_min_mult_a: 2.0,
        stock_min_mult_ab: 2.0,
        stock_min_mult_b: 3.0,
        stock_min_mult_bc: 9.0,
        stock_min_mult_c: 15.0,
        stock_seg_mult_a: 1.0,
        stock_seg_mult_ab: 2.5,
        stock_seg_mult_b: 2.0,
        stock_seg_mult_bc: 3.0,
        stock_seg_mult_c: 7.0,
        stock_max_mult_a: 5.0,
        stock_max_mult_ab: 7.0,
        stock_max_mult_b: 12.0,
        stock_max_mult_bc: 17.0,
        stock_max_mult_c: 26.0
      });
    }
  };

  const cargarConfigABC = async () => {
    try {
      const response = await http.get('/api/config-inventario/parametros-abc');
      const { niveles_servicio, config_tiendas } = response.data;

      // Buscar config específica de la tienda
      const configTienda = config_tiendas.find(
        (t: { tienda_id: string }) => t.tienda_id === orderData.tienda_destino
      );

      // Obtener valores de niveles globales
      const nivelA = niveles_servicio.find((n: { clase: string }) => n.clase === 'A');
      const nivelB = niveles_servicio.find((n: { clase: string }) => n.clase === 'B');
      const nivelC = niveles_servicio.find((n: { clase: string }) => n.clase === 'C');

      // Priorizar config de tienda, luego niveles globales, luego defaults
      setConfigDiasCobertura({
        clase_a: configTienda?.dias_cobertura_a ?? nivelA?.dias_cobertura_max ?? 7,
        clase_b: configTienda?.dias_cobertura_b ?? nivelB?.dias_cobertura_max ?? 14,
        clase_c: configTienda?.dias_cobertura_c ?? nivelC?.dias_cobertura_max ?? 30,
      });
    } catch (error) {
      console.error('Error cargando configuración ABC:', error);
      // Usar defaults
      setConfigDiasCobertura({ clase_a: 7, clase_b: 14, clase_c: 30 });
    }
  };

  const cargarProductosSugeridos = async () => {
    try {
      setLoading(true);
      const response = await http.post('/api/pedidos-sugeridos/calcular', {
        cedi_origen: orderData.cedi_origen,
        tienda_destino: orderData.tienda_destino,
        dias_cobertura: 3,
      });

      const productosConDefaults = response.data.map((p: ProductoPedido) => {
        // Si hay límites de inventario aplicados, mostrarlos en las notas con sus valores
        let notasIniciales = p.razon_pedido || '';
        const notas: string[] = [];

        // Capacidad máxima (límite superior) - texto descriptivo + valor
        if (p.ajustado_por_capacidad && p.capacidad_maxima_configurada) {
          notas.push(`⚠️ Ajustado x capacidad (${Math.round(p.capacidad_maxima_configurada)})`);
        }

        // Mínimo de exhibición (límite inferior) - texto descriptivo + valor
        if (p.ajustado_por_minimo_exhibicion && p.minimo_exhibicion_configurado) {
          notas.push(`📊 Elevado x exhibición (${Math.round(p.minimo_exhibicion_configurado)})`);
        }

        if (notas.length > 0) {
          notasIniciales = notas.join(' | ');
        }

        return {
          ...p,
          // No inicializar cantidad_pedida_bultos aquí - dejar que useEffect lo calcule con calcularPedidoSugerido()
          cantidad_pedida_bultos: undefined,
          incluido: true,
          razon_pedido: notasIniciales,
        };
      });

      setProductos(productosConDefaults);
      updateOrderData({ productos: productosConDefaults });

    } catch (error) {
      console.error('Error cargando productos sugeridos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCantidadChange = (codigoProducto: string, value: string) => {
    const newProductos = productos.map(p =>
      p.codigo_producto === codigoProducto
        ? { ...p, cantidad_pedida_bultos: parseInt(value) || 0 }
        : p
    );
    setProductos(newProductos);
    updateOrderData({ productos: newProductos });
  };

  const handleNotasChange = (codigoProducto: string, value: string) => {
    const newProductos = productos.map(p =>
      p.codigo_producto === codigoProducto
        ? { ...p, razon_pedido: value }
        : p
    );
    setProductos(newProductos);
    updateOrderData({ productos: newProductos });
  };

  const handleIncluirChange = (codigoProducto: string) => {
    const newProductos = productos.map(p =>
      p.codigo_producto === codigoProducto
        ? { ...p, incluido: !p.incluido }
        : p
    );
    setProductos(newProductos);
    updateOrderData({ productos: newProductos });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Para criticidad: asc = más críticos primero (menor número = más urgente)
      // Para otras columnas: desc = valores más altos primero
      setSortDirection(field === 'criticidad' ? 'asc' : 'desc');
    }
  };

  // Obtener categorías únicas de los productos
  const categoriasDisponibles = ['Todas', ...Array.from(new Set(productos.map(p => p.categoria).filter((c): c is string => c !== null && c !== '')))].sort();

  // Filtros ABC: A (Top 50), B (51-200), C (201-800), D (801+)
  const filtrosABC = ['Todos', 'A', 'B', 'C', 'D'];

  // Función auxiliar para obtener clasificación ABC del producto
  // Usa el valor que viene del backend (ranking por cantidad: A=Top50, B=51-200, C=201-800, D=801+)
  const getClasificacionABC = (producto: ProductoPedido): string => {
    if (producto.clasificacion_abc && producto.clasificacion_abc !== '-') {
      return producto.clasificacion_abc;
    }
    // Fallback si no hay clasificación
    return '-';
  };

  // Clase A = Top 50 (ya no necesitamos cálculo separado)
  const esTop50 = (codigoProducto: string) => {
    const producto = productos.find(p => p.codigo_producto === codigoProducto);
    return producto?.clasificacion_abc === 'A';
  };

  // Filtrar productos por vista, búsqueda, categoría y clasificación ABC
  const productosFiltrados = productos.filter(p => {
    // Filtro por vista (seleccionados/no seleccionados/todos)
    if (vistaActiva === 'seleccionados' && !p.incluido) {
      return false;
    }
    if (vistaActiva === 'no_seleccionados' && p.incluido) {
      return false;
    }

    // Filtro por categoría
    if (categoriaActiva !== 'Todas' && p.categoria !== categoriaActiva) {
      return false;
    }

    // Filtro por clasificación ABC (A=Top50, B, C, D)
    if (cuadranteActivo !== 'Todos') {
      const abc = getClasificacionABC(p);
      if (abc !== cuadranteActivo) {
        return false;
      }
    }

    // Filtro por CEDI (con stock / sin stock)
    if (filtroCedi !== 'todos') {
      const tienStockCedi = (p.stock_cedi_origen || 0) > 0;
      if (filtroCedi === 'con_stock' && !tienStockCedi) return false;
      if (filtroCedi === 'sin_stock' && tienStockCedi) return false;
    }

    // Filtro por prioridad (criticidad)
    if (filtroPrioridad !== 'todas' && stockParams) {
      const velocidadP75 = p.prom_p75_unid || p.prom_ventas_20dias_unid;
      if (velocidadP75 <= 0) return false; // Sin ventas no tiene criticidad válida

      const stockTotalUnidades = p.stock_tienda + p.stock_en_transito;
      const diasStockActual = stockTotalUnidades / velocidadP75;

      // Calcular umbrales de días según ABC
      const abc = p.clasificacion_abc || '-';
      const multSS = stockParams[`stock_seg_mult_${abc.toLowerCase()}` as keyof StockParams] || stockParams.stock_seg_mult_c;
      const multMin = stockParams[`stock_min_mult_${abc.toLowerCase()}` as keyof StockParams] || stockParams.stock_min_mult_c;
      const multMax = stockParams[`stock_max_mult_${abc.toLowerCase()}` as keyof StockParams] || stockParams.stock_max_mult_c;

      const diasSS = multSS;
      const diasROP = multMin;
      const diasMAX = multMax;

      // Determinar nivel de criticidad
      let nivelCriticidad: 'critico' | 'urgente' | 'optimo' | 'exceso';
      if (diasStockActual <= diasSS) {
        nivelCriticidad = 'critico';
      } else if (diasStockActual <= diasROP) {
        nivelCriticidad = 'urgente';
      } else if (diasStockActual <= diasMAX) {
        nivelCriticidad = 'optimo';
      } else {
        nivelCriticidad = 'exceso';
      }

      if (nivelCriticidad !== filtroPrioridad) return false;
    }

    // Filtro por búsqueda (soporta múltiples códigos separados por coma)
    if (!searchTerm) return true;

    // Detectar si es búsqueda múltiple por códigos (contiene comas)
    if (searchTerm.includes(',')) {
      // Búsqueda múltiple por códigos
      const codigos = searchTerm.split(',').map(c => c.trim()).filter(c => c.length > 0);
      // Normalizar código del producto (quitar ceros a la izquierda)
      const codigoNormalizado = p.codigo_producto.replace(/^0+/, '');
      // Verificar si alguno de los códigos buscados coincide
      return codigos.some(codigo => {
        const codigoBuscado = codigo.replace(/^0+/, '');
        return codigoNormalizado === codigoBuscado ||
               p.codigo_producto === codigo ||
               p.codigo_producto.endsWith(codigo);
      });
    }

    // Búsqueda normal (texto libre)
    const term = searchTerm.toLowerCase();
    return (
      p.codigo_producto.toLowerCase().includes(term) ||
      p.descripcion_producto.toLowerCase().includes(term)
    );
  });

  // Obtener velocidad de venta P75 en bultos/día (para cálculos de stock)
  const getVelocidadP75Bultos = (producto: ProductoPedido): number => {
    return (producto.prom_p75_unid || 0) / producto.cantidad_bultos;
  };

  // Obtener velocidad de venta promedio en bultos/día (para clasificación ABC)
  const getVelocidadPromBultos = (producto: ProductoPedido): number => {
    return producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
  };

  // =====================================================================
  // Funciones para obtener valores de stock del backend (nueva metodologia ABC)
  // Los valores ya vienen calculados en UNIDADES desde el backend
  // =====================================================================

  // Stock Minimo en BULTOS (desde backend, ya calculado con nueva formula)
  const getStockMinimoBultos = (producto: ProductoPedido): number => {
    // El backend envia stock_minimo en UNIDADES, convertir a bultos
    return producto.stock_minimo / producto.cantidad_bultos;
  };

  // Stock Seguridad en BULTOS
  const getStockSeguridadBultos = (producto: ProductoPedido): number => {
    return producto.stock_seguridad / producto.cantidad_bultos;
  };

  // Punto de Reorden en BULTOS
  const getPuntoReordenBultos = (producto: ProductoPedido): number => {
    return producto.punto_reorden / producto.cantidad_bultos;
  };

  // Stock Maximo en BULTOS
  const getStockMaximoBultos = (producto: ProductoPedido): number => {
    return producto.stock_maximo / producto.cantidad_bultos;
  };

  // =====================================================================
  // Funciones para obtener DIAS de cobertura (dividiendo por P75)
  // =====================================================================

  // Dias de cobertura para Stock Minimo
  const getDiasMinimo = (producto: ProductoPedido): number => {
    const velocidadP75 = getVelocidadP75Bultos(producto);
    if (velocidadP75 <= 0) return 0;
    return getStockMinimoBultos(producto) / velocidadP75;
  };

  // Dias de cobertura para Stock Seguridad
  const getDiasSeguridad = (producto: ProductoPedido): number => {
    const velocidadP75 = getVelocidadP75Bultos(producto);
    if (velocidadP75 <= 0) return 0;
    return getStockSeguridadBultos(producto) / velocidadP75;
  };

  // Dias de cobertura para Stock Maximo
  const getDiasMaximo = (producto: ProductoPedido): number => {
    const velocidadP75 = getVelocidadP75Bultos(producto);
    if (velocidadP75 <= 0) return 0;
    return getStockMaximoBultos(producto) / velocidadP75;
  };

  // =====================================================================
  // Funciones legacy para compatibilidad con modales (usan stockParams)
  // TODO: Actualizar modales para usar valores del backend
  // =====================================================================

  const calcularStockMinimo = (producto: ProductoPedido): number => {
    // Usar valor del backend si esta disponible
    if (producto.stock_minimo > 0) {
      return getStockMinimoBultos(producto);
    }
    // Fallback a calculo legacy
    if (!stockParams) return 0;
    const ventaDiariaABC = getVelocidadPromBultos(producto);
    const velocidadP75 = getVelocidadP75Bultos(producto);
    let multiplicador = 0;
    if (ventaDiariaABC >= 20) multiplicador = stockParams.stock_min_mult_a;
    else if (ventaDiariaABC >= 5) multiplicador = stockParams.stock_min_mult_ab;
    else if (ventaDiariaABC >= 0.45) multiplicador = stockParams.stock_min_mult_b;
    else if (ventaDiariaABC >= 0.20) multiplicador = stockParams.stock_min_mult_bc;
    else if (ventaDiariaABC >= 0.001) multiplicador = stockParams.stock_min_mult_c;
    else return 0;
    return velocidadP75 * multiplicador;
  };

  // NOTA: Las funciones calcularStockSeguridad, calcularPuntoReorden y calcularStockMaximo fueron eliminadas.
  // Toda la lógica de negocio está centralizada en el backend.
  // El frontend usa los valores pre-calculados: producto.punto_reorden, producto.stock_maximo, etc.

  const calcularPedidoSugerido = (producto: ProductoPedido): number => {
    // Usar valor calculado por el backend (cantidad_ajustada_bultos)
    // La lógica de negocio debe estar centralizada en el backend
    if (producto.cantidad_ajustada_bultos !== undefined && producto.cantidad_ajustada_bultos >= 0) {
      return Math.round(producto.cantidad_ajustada_bultos);
    }

    // Fallback: si el backend no envió el valor, no sugerir nada
    return 0;
  };

  // Calcular cuántos días de cobertura proporciona el pedido sugerido
  // Retorna: días que aporta SOLO el pedido (sin contar stock actual)
  const calcularDiasPedidoSugerido = (producto: ProductoPedido): number | null => {
    const pedidoBultos = calcularPedidoSugerido(producto);
    if (pedidoBultos <= 0) return null;

    // Usar velocidad P75 (más conservador)
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return null;

    const velocidadP75Bultos = velocidadP75 / producto.cantidad_bultos;

    // Días que aporta solo el pedido (no el total resultante)
    return pedidoBultos / velocidadP75Bultos;
  };

  const esStockCritico = (producto: ProductoPedido): boolean => {
    if (!stockParams || producto.prom_ventas_20dias_unid <= 0) return false;

    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const stockMinimoBultos = calcularStockMinimo(producto);
    const stockMinimoUnidades = stockMinimoBultos * producto.cantidad_bultos;

    return stockTotalUnidades <= stockMinimoUnidades;
  };

  // Función para calcular criticidad (0 = más crítico, mayor número = menos crítico)
  // Niveles basados en umbrales de inventario:
  // - CRÍTICO: Stock ≤ SS (Stock de Seguridad)
  // - URGENTE: SS < Stock ≤ ROP (Punto de Reorden)
  // - ÓPTIMO: ROP < Stock ≤ MAX
  // - EXCESO: Stock > MAX
  const calcularCriticidad = (producto: ProductoPedido): number => {
    try {
      if (!stockParams || !producto || producto.prom_ventas_20dias_unid <= 0) return 999;

    const clasificacion = getClasificacionABC(producto);

    // Obtener días de stock actual y umbrales
    const diasStockActual = getDiasStockActual(producto);
    const diasSS = getDiasSeguridad(producto);
    const diasROP = getDiasMinimo(producto); // ROP = Punto de Reorden
    const diasMAX = getDiasMaximo(producto);

    // Pesos por clasificación ABC Pareto (A es más importante)
    const pesoABC = {
      'A': 1,
      'B': 2,
      'C': 3,
      '-': 4
    }[clasificacion] || 4;

    // Determinar nivel de urgencia (4 niveles claros)
    let urgenciaStock = 0;

    if (diasStockActual <= diasSS) {
      // NIVEL 1: CRÍTICO - Por debajo o igual al Stock de Seguridad
      urgenciaStock = 1;
    } else if (diasStockActual <= diasROP) {
      // NIVEL 2: URGENTE - Entre SS y ROP (hay que pedir)
      urgenciaStock = 2;
    } else if (diasStockActual <= diasMAX) {
      // NIVEL 3: ÓPTIMO - Entre ROP y MAX (nivel ideal)
      urgenciaStock = 3;
    } else {
      // NIVEL 4: EXCESO - Por encima del máximo
      urgenciaStock = 4;
    }

    // Criticidad combinada: urgenciaStock tiene más peso (x10), luego ABC
    // Menor número = más crítico
    return (urgenciaStock * 10) + pesoABC;
    } catch {
      return 999;
    }
  };

  // Helper para obtener días de stock actual
  const getDiasStockActual = (producto: ProductoPedido): number => {
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return 999;
    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    return stockTotalUnidades / velocidadP75;
  };

  // Cargar análisis XYZ desde API cuando se activa Modo Consultor
  useEffect(() => {
    if (modoConsultorActivo && usarDatosReales && productosFiltrados.length > 0 && Object.keys(analisisXYZReal).length === 0) {
      cargarAnalisisXYZReal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoConsultorActivo, usarDatosReales, productosFiltrados.length]);

  const cargarAnalisisXYZReal = async () => {
    if (!orderData.tienda_destino || productosFiltrados.length === 0) {
      return;
    }

    setAnalisisXYZCargando(true);

    try {
      const codigosProductos = productosFiltrados.map(p => p.codigo_producto);

      console.log(`🔬 Cargando análisis XYZ para ${codigosProductos.length} productos...`);

      const analisisReal = await obtenerAnalisisXYZBatch(
        codigosProductos,
        orderData.tienda_destino,
        (completados, total) => {
          console.log(`📊 Progreso: ${completados}/${total}`);
        }
      );

      setAnalisisXYZReal(analisisReal);
      console.log(`✅ Análisis XYZ cargado: ${Object.keys(analisisReal).length} productos`);
    } catch (error) {
      console.error('Error cargando análisis XYZ real:', error);
      // En caso de error, usar dummy como fallback
      console.warn('⚠️ Usando datos dummy como fallback');
      setUsarDatosReales(false);
    } finally {
      setAnalisisXYZCargando(false);
    }
  };

  // Generar análisis XYZ para productos filtrados (solo cuando Modo Consultor está activo)
  const analisisXYZData = useMemo<Record<string, AnalisisXYZ>>(() => {
    if (!modoConsultorActivo || !stockParams || productosFiltrados.length === 0) {
      return {};
    }

    // Si estamos cargando datos reales, retornar vacío temporalmente
    if (usarDatosReales && analisisXYZCargando) {
      return {};
    }

    // Si usamos datos reales y ya los tenemos
    if (usarDatosReales && Object.keys(analisisXYZReal).length > 0) {
      return analisisXYZReal;
    }

    // Fallback a datos dummy
    const analisisMap: Record<string, AnalisisXYZ> = {};
    productosFiltrados.forEach(producto => {
      const clasificacionABC = getClasificacionABC(producto);
      analisisMap[producto.codigo_producto] = generarAnalisisXYZDummy(producto, clasificacionABC, stockParams);
    });

    return analisisMap;
  }, [modoConsultorActivo, stockParams, productosFiltrados, usarDatosReales, analisisXYZCargando, analisisXYZReal]);


  // Handlers para Modo Consultor
  const handleComparativoClick = (producto: ProductoPedido) => {
    setSelectedProductoComparativo(producto);
    setAnalisisComparativoModalOpen(true);
  };

  const handleUsarABC = () => {
    if (selectedProductoComparativo) {
      const analisis = analisisXYZData[selectedProductoComparativo.codigo_producto];
      if (analisis) {
        handleCantidadChange(selectedProductoComparativo.codigo_producto, analisis.stock_calculado.abc.sugerido.toString());
      }
    }
    setAnalisisComparativoModalOpen(false);
  };

  const handleUsarXYZ = () => {
    if (selectedProductoComparativo) {
      const analisis = analisisXYZData[selectedProductoComparativo.codigo_producto];
      if (analisis) {
        handleCantidadChange(selectedProductoComparativo.codigo_producto, analisis.stock_calculado.xyz.sugerido.toString());
      }
    }
    setAnalisisComparativoModalOpen(false);
  };

  // Ordenar productos
  const productosOrdenados = [...productosFiltrados].sort((a, b) => {
    if (!sortField) return 0;

    // Caso especial para ABC (ordenamiento por clasificación Pareto)
    if (sortField === 'abc') {
      const abcOrder = { 'A': 1, 'B': 2, 'C': 3, '-': 4 };
      const aClasif = getClasificacionABC(a);
      const bClasif = getClasificacionABC(b);
      const aOrder = abcOrder[aClasif as keyof typeof abcOrder] || 4;
      const bOrder = abcOrder[bClasif as keyof typeof abcOrder] || 4;

      if (sortDirection === 'asc') {
        return aOrder - bOrder;
      } else {
        return bOrder - aOrder;
      }
    }

    // Caso especial para Criticidad (ordenamiento por urgencia combinada)
    if (sortField === 'criticidad') {
      const aCriticidad = calcularCriticidad(a);
      const bCriticidad = calcularCriticidad(b);

      if (sortDirection === 'asc') {
        // Menor número = más crítico, por lo tanto ascendente muestra los más críticos primero
        return aCriticidad - bCriticidad;
      } else {
        return bCriticidad - aCriticidad;
      }
    }

    let aValue: number, bValue: number;

    switch (sortField) {
      case 'prom_20d':
        aValue = a.prom_ventas_20dias_unid;
        bValue = b.prom_ventas_20dias_unid;
        break;
      case 'stock':
        aValue = a.stock_tienda;
        bValue = b.stock_tienda;
        break;
      case 'stock_transito':
        aValue = a.stock_en_transito;
        bValue = b.stock_en_transito;
        break;
      case 'stock_total':
        aValue = a.stock_tienda + a.stock_en_transito;
        bValue = b.stock_tienda + b.stock_en_transito;
        break;
      case 'stock_dias':
        // Días de stock usando P75
        aValue = a.prom_p75_unid > 0 ? (a.stock_tienda + a.stock_en_transito) / a.prom_p75_unid : 999;
        bValue = b.prom_p75_unid > 0 ? (b.stock_tienda + b.stock_en_transito) / b.prom_p75_unid : 999;
        break;
      case 'stock_cedi':
        aValue = a.stock_cedi_origen;
        bValue = b.stock_cedi_origen;
        break;
      case 'sugerido':
        aValue = a.cantidad_ajustada_bultos;
        bValue = b.cantidad_ajustada_bultos;
        break;
      case 'pedir':
        aValue = a.cantidad_pedida_bultos || 0;
        bValue = b.cantidad_pedida_bultos || 0;
        break;
      case 'top3':
        aValue = a.prom_top3_unid || 0;
        bValue = b.prom_top3_unid || 0;
        break;
      case 'p75':
        aValue = a.prom_p75_unid || 0;
        bValue = b.prom_p75_unid || 0;
        break;
      case 'ss':
        aValue = a.stock_seguridad || 0;
        bValue = b.stock_seguridad || 0;
        break;
      case 'rop':
        aValue = a.stock_minimo || 0;
        bValue = b.stock_minimo || 0;
        break;
      case 'max':
        aValue = a.stock_maximo || 0;
        bValue = b.stock_maximo || 0;
        break;
      default:
        return 0;
    }

    if (sortDirection === 'asc') {
      return aValue - bValue;
    } else {
      return bValue - aValue;
    }
  });

  const productosIncluidos = productos.filter(p => p.incluido);

  // Función para exportar a Excel
  const exportarExcel = () => {
    // Usar productos incluidos y ordenados
    const productosParaExportar = productosOrdenados.filter(p => p.incluido);

    if (productosParaExportar.length === 0) {
      alert('No hay productos seleccionados para exportar');
      return;
    }

    // Preparar datos para Excel siguiendo el formato solicitado
    const datosExcel = productosParaExportar.map((p, index) => {
      const pedidoUnidades = (p.cantidad_pedida_bultos || p.cantidad_ajustada_bultos) * p.cantidad_bultos;
      const pedidoBultos = p.cantidad_pedida_bultos || p.cantidad_ajustada_bultos;

      return {
        '#': index + 1,
        'Codigo': p.codigo_producto,
        'Cod. Barra': p.codigo_barras || '',
        'Descripción': p.descripcion_producto,
        'Cuadrante': p.cuadrante_producto || '',
        'ABC': p.clasificacion_abc || '',
        'Pedido Unidades': pedidoUnidades,
        'U/B': p.cantidad_bultos,
        'Unidad Pedido': p.unidad_pedido || 'Bulto',
        'Pedido Bultos': pedidoBultos,
        'Stock Tienda': p.stock_tienda,
        'Stock CEDI': p.stock_cedi_origen,
      };
    });

    // Crear libro de Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosExcel);

    // Ajustar anchos de columnas
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 12 },  // Codigo
      { wch: 15 },  // Cod. Barra
      { wch: 50 },  // Descripción
      { wch: 15 },  // Cuadrante
      { wch: 5 },   // ABC
      { wch: 15 },  // Pedido Unidades
      { wch: 6 },   // U/B
      { wch: 12 },  // Unidad Pedido
      { wch: 13 },  // Pedido Bultos
      { wch: 12 },  // Stock Tienda
      { wch: 12 },  // Stock CEDI
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

    // Generar nombre de archivo con fecha y tienda
    const fecha = new Date().toISOString().split('T')[0];
    const tiendaNombre = orderData.tienda_destino_nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'pedido';
    const nombreArchivo = `Pedido_${tiendaNombre}_${fecha}.xlsx`;

    // Descargar archivo
    XLSX.writeFile(wb, nombreArchivo);
  };

  const SortableHeader = ({ field, label, bgColor = 'bg-gray-100', width }: { field: SortField; label: string; bgColor?: string; width?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none ${bgColor}`}
      style={width ? { width } : undefined}
    >
      <div className="flex items-center gap-0.5 justify-center">
        <span>{label}</span>
        {sortField === field && (
          <span className="text-gray-900 text-xs">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  return (
    <div className="w-full max-w-none px-2 space-y-4">
      {/* Header con información del pedido */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Productos Sugeridos</h2>
          <button
            onClick={exportarExcel}
            disabled={productosIncluidos.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar Excel ({productosIncluidos.length})
          </button>
        </div>

        {/* Información origen/destino + Estadísticas en una fila */}
        <div className="flex items-center gap-6 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Origen:</span>
            <span className="text-sm font-medium text-gray-900 bg-gray-50 px-2 py-1 rounded">{orderData.cedi_origen_nombre}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Destino:</span>
            <span className="text-sm font-medium text-gray-900 bg-gray-50 px-2 py-1 rounded">{orderData.tienda_destino_nombre}</span>
          </div>
          <div className="bg-purple-50 rounded-md px-3 py-1.5">
            <span className="text-xs text-purple-600">Total: </span>
            <span className="text-sm font-bold text-purple-900">{productos.length}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[150px] max-w-[250px]">
            <input
              type="text"
              placeholder="🔍 Buscar..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPaginaActual(1); }}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>

          {/* Dropdown de Categoría */}
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-600">Cat:</label>
            <select
              value={categoriaActiva}
              onChange={(e) => { setCategoriaActiva(e.target.value); setPaginaActual(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
            >
              {categoriasDisponibles.map((categoria) => {
                const count = productos.filter(p => categoria === 'Todas' || p.categoria === categoria).length;
                return (
                  <option key={categoria} value={categoria}>
                    {categoria} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Dropdown de Clasificación ABC */}
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-600">ABC:</label>
            <select
              value={cuadranteActivo}
              onChange={(e) => { setCuadranteActivo(e.target.value); setPaginaActual(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
            >
              {filtrosABC.map((filtro) => {
                const count = productos.filter(p => {
                  if (filtro === 'Todos') return true;
                  return getClasificacionABC(p) === filtro;
                }).length;
                // Etiquetas descriptivas para cada clase
                const labels: Record<string, string> = {
                  'Todos': 'Todos',
                  'A': '🏆 A (Top 50)',
                  'B': 'B (51-200)',
                  'C': 'C (201-800)',
                  'D': 'D (801+)'
                };
                return (
                  <option key={filtro} value={filtro}>
                    {labels[filtro] || filtro} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Dropdown de Vista (Seleccionados/No seleccionados/Todos) */}
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-600">Vista:</label>
            <select
              value={vistaActiva}
              onChange={(e) => { setVistaActiva(e.target.value as 'seleccionados' | 'no_seleccionados' | 'todos'); setPaginaActual(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
            >
              <option value="seleccionados">
                Seleccionados ({productos.filter(p => p.incluido).length})
              </option>
              <option value="no_seleccionados">
                No seleccionados ({productos.filter(p => !p.incluido).length})
              </option>
              <option value="todos">
                Todos ({productos.length})
              </option>
            </select>
          </div>

          {/* Dropdown de CEDI (Con stock/Sin stock) */}
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-600">CEDI:</label>
            <select
              value={filtroCedi}
              onChange={(e) => { setFiltroCedi(e.target.value as 'todos' | 'con_stock' | 'sin_stock'); setPaginaActual(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
            >
              <option value="todos">
                Todos ({productos.length})
              </option>
              <option value="con_stock">
                Con stock ({productos.filter(p => (p.stock_cedi_origen || 0) > 0).length})
              </option>
              <option value="sin_stock">
                Sin stock ({productos.filter(p => (p.stock_cedi_origen || 0) === 0).length})
              </option>
            </select>
          </div>

          {/* Dropdown de Prioridad (Criticidad) */}
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-gray-600">Prioridad:</label>
            <select
              value={filtroPrioridad}
              onChange={(e) => { setFiltroPrioridad(e.target.value as 'todas' | 'critico' | 'urgente' | 'optimo' | 'exceso'); setPaginaActual(1); }}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
            >
              <option value="todas">Todas</option>
              <option value="critico">🔴 Crítico</option>
              <option value="urgente">🟠 Urgente</option>
              <option value="optimo">🟢 Óptimo</option>
              <option value="exceso">🔵 Exceso</option>
            </select>
          </div>

          {/* Contador de resultados */}
          {(searchTerm || categoriaActiva !== 'Todas' || cuadranteActivo !== 'Todos' || vistaActiva !== 'todos' || filtroCedi !== 'todos' || filtroPrioridad !== 'todas') && (
            <div className="text-xs text-gray-500">
              {productosFiltrados.length}/{productos.length}
            </div>
          )}
        </div>

        {/* Resumen de productos seleccionados */}
        {productos.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Seleccionados:</span>
                <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                  {productos.filter(p => p.incluido).length}/{productos.length}
                </span>
              </div>

              {/* Por Categoría */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Cat:</span>
                {(() => {
                  const seleccionados = productos.filter(p => p.incluido);
                  const porCategoria = seleccionados.reduce((acc, p) => {
                    const cat = p.categoria || 'Sin Cat.';
                    acc[cat] = (acc[cat] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  return Object.entries(porCategoria)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([cat, count]) => (
                      <span key={cat} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {cat.length > 10 ? cat.slice(0, 10) + '...' : cat}: {count}
                      </span>
                    ));
                })()}
              </div>

              {/* Por ABC */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">ABC:</span>
                {(() => {
                  const seleccionados = productos.filter(p => p.incluido);
                  const top50Count = seleccionados.filter(p => esTop50(p.codigo_producto)).length;
                  const aCount = seleccionados.filter(p => getClasificacionABC(p) === 'A' && !esTop50(p.codigo_producto)).length;
                  const bCount = seleccionados.filter(p => getClasificacionABC(p) === 'B').length;
                  const cCount = seleccionados.filter(p => getClasificacionABC(p) === 'C').length;

                  return (
                    <>
                      {top50Count > 0 && <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-medium">🏆{top50Count}</span>}
                      {aCount > 0 && <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-medium">A:{aCount}</span>}
                      {bCount > 0 && <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded font-medium">B:{bCount}</span>}
                      {cCount > 0 && <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">C:{cCount}</span>}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabla de productos */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-600">Cargando productos...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="w-full divide-y divide-gray-200 text-sm" style={{ minWidth: '1400px' }}>
              <thead className="bg-gray-100 sticky top-0 z-20">
                {/* Fila de categorías */}
                <tr className="border-b-2 border-gray-300">
                  <th className="sticky left-0 z-30 bg-gray-200" style={{ width: '36px' }}></th>
                  <th className="sticky left-[36px] z-30 bg-gray-200" style={{ width: '28px' }}></th>
                  <th colSpan={3} className="sticky left-[64px] z-30 bg-blue-200 px-1 py-1 text-center font-bold text-blue-900 text-xs uppercase border-r border-blue-300">
                    Producto
                  </th>
                  <th colSpan={3} className="bg-purple-200 px-2 py-1 text-center font-bold text-purple-900 text-xs uppercase border-r border-purple-300">
                    Ventas
                  </th>
                  <th colSpan={5} className="bg-green-200 px-2 py-1 text-center font-bold text-green-900 text-xs uppercase border-r border-green-300">
                    Inventario
                  </th>
                  <th colSpan={6 + (modoConsultorActivo ? 4 : 0)} className="bg-orange-200 px-2 py-1 text-center font-bold text-orange-900 text-xs uppercase border-r border-orange-300">
                    Cálculos Pedido
                  </th>
                  <th colSpan={3} className="bg-gray-200 px-2 py-1 text-center font-bold text-gray-700 text-xs uppercase">
                    Pedido
                  </th>
                </tr>
                {/* Fila de columnas */}
                <tr>
                  <th className="sticky left-0 z-30 bg-gray-100 px-2 py-2 text-left" style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={productos.every(p => p.incluido)}
                      onChange={(e) => {
                        const newProductos = productos.map(p => ({ ...p, incluido: e.target.checked }));
                        setProductos(newProductos);
                        updateOrderData({ productos: newProductos });
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="sticky left-[36px] z-30 bg-gray-100 px-0 py-2 text-center font-semibold text-gray-500 text-xs" style={{ width: '28px' }}>#</th>
                  <th className="sticky left-[64px] z-30 bg-blue-100 px-1 py-2 text-center font-semibold text-gray-700 text-xs uppercase whitespace-nowrap" style={{ width: '70px' }}>Código</th>
                  <th className="sticky left-[134px] z-30 bg-blue-100 px-1 py-2 text-left font-semibold text-gray-700 text-xs uppercase whitespace-nowrap" style={{ width: '200px' }}>Descripción</th>
                  <th className="bg-blue-100 px-1 py-2 text-center font-semibold text-gray-700 text-xs uppercase whitespace-nowrap" style={{ width: '35px' }}>U/B</th>
                  <th className="bg-purple-100 px-0 py-2 text-center font-semibold text-gray-700 text-xs uppercase whitespace-nowrap" style={{ width: '28px' }} title="Análisis de Ventas por Tienda">
                    <span className="text-sm">📈</span>
                  </th>
                  <SortableHeader field="prom_20d" label="20d" bgColor="bg-purple-100" width="50px" />
                  <SortableHeader field="p75" label="P75" bgColor="bg-purple-100" width="50px" />
                  <SortableHeader field="stock" label="Stk" bgColor="bg-green-100" width="50px" />
                  <SortableHeader field="stock_transito" label="Trán" bgColor="bg-green-100" width="45px" />
                  <SortableHeader field="stock_total" label="Tot" bgColor="bg-green-100" width="50px" />
                  <SortableHeader field="stock_dias" label="Días" bgColor="bg-green-100" width="40px" />
                  <SortableHeader field="stock_cedi" label="CEDI" bgColor="bg-green-100" width="50px" />
                  <SortableHeader field="abc" label="ABC" bgColor="bg-orange-100" width="45px" />
                  <SortableHeader field="criticidad" label="🔥" bgColor="bg-orange-100" width="35px" />
                  <SortableHeader field="ss" label="SS" bgColor="bg-orange-100" width="45px" />
                  <SortableHeader field="rop" label="ROP" bgColor="bg-orange-100" width="45px" />
                  <SortableHeader field="max" label="Max" bgColor="bg-orange-100" width="45px" />
                  <SortableHeader field="sugerido" label="Sug" bgColor="bg-orange-100" width="50px" />
                  {/* Columna V2 (Cobertura Real) */}
                  <th className="bg-cyan-100 px-1 py-2 text-center font-semibold text-cyan-800 text-xs uppercase whitespace-nowrap" style={{ width: '65px' }} title="Cobertura Real: Días que realmente cubre el pedido considerando demanda por día de semana">
                    Cob.
                  </th>

                  {/* Columnas XYZ - Solo visibles en Modo Consultor */}
                  {modoConsultorActivo && (
                    <>
                      <th className="bg-indigo-100 px-2 py-2 text-center font-semibold text-indigo-900 text-xs uppercase whitespace-nowrap" style={{ width: '50px' }}>
                        XYZ
                      </th>
                      <th className="bg-indigo-100 px-2 py-2 text-center font-semibold text-indigo-900 text-xs uppercase whitespace-nowrap" style={{ width: '55px' }}>
                        Sug
                      </th>
                      <th className="bg-purple-100 px-2 py-2 text-center font-semibold text-purple-900 text-xs uppercase whitespace-nowrap" style={{ width: '50px' }}>
                        Δ
                      </th>
                      <th className="bg-purple-100 px-2 py-2 text-center font-semibold text-purple-900 text-xs uppercase whitespace-nowrap" style={{ width: '60px' }}>
                        Ver
                      </th>
                    </>
                  )}

                  <SortableHeader field="pedir" label="Pedir" bgColor="bg-yellow-100" width="55px" />
                  <th className="bg-gray-100 px-1 py-2 text-center font-semibold text-gray-700 text-xs uppercase whitespace-nowrap" style={{ width: '45px' }}>Peso</th>
                  <th className="bg-gray-100 px-1 py-2 text-center font-semibold text-gray-700 text-xs uppercase whitespace-nowrap" style={{ width: '80px' }}>Notas</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productosOrdenados.slice((paginaActual - 1) * productosPorPagina, paginaActual * productosPorPagina).map((producto, index) => {
                  const stockCritico = esStockCritico(producto);
                  return (
                  <tr
                    key={`${producto.codigo_producto}-${index}`}
                    className={`${producto.incluido ? '' : 'opacity-40'} ${stockCritico ? 'bg-red-50 border-l-2 border-red-600' : 'hover:bg-gray-50'}`}
                  >
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5" style={{ width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={producto.incluido || false}
                        onChange={() => handleIncluirChange(producto.codigo_producto)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="sticky left-[36px] z-10 bg-gray-50 px-0 py-1.5 text-[10px] text-gray-400 text-center font-mono" style={{ width: '28px' }}>
                      {(paginaActual - 1) * productosPorPagina + index + 1}
                    </td>
                    <td className="sticky left-[64px] z-10 bg-blue-50 px-1 py-1.5 font-mono text-xs font-medium text-gray-900 text-center" style={{ width: '70px' }}>{producto.codigo_producto}</td>
                    <td className="sticky left-[134px] z-10 bg-blue-50 px-1 py-1.5 text-xs text-left" style={{ width: '200px', maxWidth: '200px' }}>
                      <span
                        className="text-gray-900 text-left w-full block overflow-hidden text-ellipsis whitespace-nowrap"
                        title={producto.descripcion_producto}
                      >
                        {producto.descripcion_producto}
                      </span>
                    </td>
                    <td className="bg-blue-50 px-1 py-1.5 text-xs text-gray-700 text-center" style={{ width: '35px' }}>{Math.round(producto.cantidad_bultos)}</td>
                    <td className="bg-purple-50 px-0 py-1.5 text-center" style={{ width: '28px' }}>
                      <button
                        onClick={() => handleVentasClick(producto)}
                        className="text-purple-600 hover:text-purple-800 hover:scale-110 cursor-pointer transition-all"
                        title="Ver análisis de ventas"
                      >
                        <span className="text-sm">📈</span>
                      </button>
                    </td>
                    <td className="bg-purple-50 px-1 py-1.5 text-xs text-purple-800 text-center font-medium" style={{ width: '50px' }}>
                      <span className="font-medium block">{(producto.prom_ventas_20dias_unid / producto.cantidad_bultos).toFixed(1)}</span>
                      <span className="text-[10px] text-gray-500 block">{formatNumber(producto.prom_ventas_20dias_unid)}u</span>
                    </td>
                    <td className="bg-purple-50 px-1 py-1.5 text-xs text-purple-800 text-center font-semibold" style={{ width: '50px' }}>
                      <button
                        onClick={() => handleMetodosPromedioClick(producto)}
                        className="hover:text-purple-900 hover:underline cursor-pointer transition-colors"
                        title="Click para ver detalle P75"
                      >
                        <span className="font-medium block">{producto.prom_p75_unid ? (producto.prom_p75_unid / producto.cantidad_bultos).toFixed(1) : '-'}</span>
                        {producto.prom_p75_unid && <span className="text-[10px] text-gray-500 block">{formatNumber(producto.prom_p75_unid)}u</span>}
                      </button>
                    </td>
                    <td className="bg-green-50 px-1 py-1.5 text-xs text-gray-800 text-center font-medium" style={{ width: '50px' }}>
                      <button
                        onClick={() => handleHistoricoInventarioClick(producto)}
                        className="hover:text-green-700 hover:underline cursor-pointer transition-colors"
                        title="Click para ver histórico"
                      >
                        <span className="font-medium block">{formatNumber(producto.stock_tienda / producto.cantidad_bultos, 1)}</span>
                        <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_tienda)}u</span>
                      </button>
                    </td>
                    <td className="bg-green-50 px-1 py-1.5 text-xs text-amber-800 text-center font-medium" style={{ width: '45px' }}>
                      <span className="font-medium block">{formatNumber(producto.stock_en_transito / producto.cantidad_bultos, 1)}</span>
                      <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_en_transito)}u</span>
                    </td>
                    <td className="bg-green-50 px-1 py-1.5 text-xs text-blue-800 text-center font-medium" style={{ width: '50px' }}>
                      <span className="font-medium block">{formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos, 1)}</span>
                      <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_tienda + producto.stock_en_transito)}u</span>
                    </td>
                    <td className={`bg-green-50 px-1 py-1.5 text-xs text-center font-semibold ${stockCritico ? 'text-red-700' : 'text-indigo-800'}`} style={{ width: '40px' }}>
                      <button
                        onClick={() => handleStockDiasClick(producto)}
                        className={`hover:underline cursor-pointer transition-colors ${stockCritico ? 'hover:text-red-900' : 'hover:text-indigo-900'}`}
                        title="Click para ver análisis de urgencia"
                      >
                        {producto.prom_p75_unid && producto.prom_p75_unid > 0
                          ? ((producto.stock_tienda + producto.stock_en_transito) / producto.prom_p75_unid).toFixed(1)
                          : '∞'
                        }
                      </button>
                    </td>
                    <td className="bg-green-50 px-1 py-1.5 text-xs text-green-800 text-center font-medium" style={{ width: '50px' }}>
                      <button
                        onClick={() => handleHistoricoCediClick(producto)}
                        className="hover:text-green-900 hover:underline cursor-pointer transition-colors"
                        title="Click para ver histórico CEDI"
                      >
                        <span className="font-medium block">{formatNumber(producto.stock_cedi_origen / producto.cantidad_bultos, 1)}</span>
                        <span className="text-[10px] text-gray-500 block">{formatNumber(producto.stock_cedi_origen)}u</span>
                      </button>
                    </td>
                    <td className="bg-orange-50 px-1 py-1.5 text-xs text-center" style={{ width: '45px' }}>
                      <button
                        onClick={() => handleABCClick(producto)}
                        className={`font-semibold hover:underline cursor-pointer transition-colors ${(() => {
                          const clasif = getClasificacionABC(producto);
                          if (clasif === 'A') return 'text-red-700 hover:text-red-900';
                          if (clasif === 'B') return 'text-yellow-700 hover:text-yellow-900';
                          if (clasif === 'C') return 'text-green-700 hover:text-green-900';
                          if (clasif === 'D') return 'text-purple-700 hover:text-purple-900';
                          return 'text-gray-600 hover:text-gray-800';
                        })()}`}
                        title={esTop50(producto.codigo_producto) ? 'Top 50 - Click para ver clasificación ABC' : 'Click para ver clasificación ABC'}
                      >
                        {esTop50(producto.codigo_producto) && <span className="mr-0.5">🏆</span>}
                        {getClasificacionABC(producto)}
                      </button>
                    </td>
                    <td className="bg-orange-50 px-0 py-1.5 text-xs text-center font-semibold" style={{ width: '35px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (() => {
                        const criticidad = calcularCriticidad(producto);
                        const clasificacion = getClasificacionABC(producto);

                        // Obtener días de stock actual y umbrales
                        const diasStockActual = getDiasStockActual(producto);
                        const diasSS = getDiasSeguridad(producto);
                        const diasROP = getDiasMinimo(producto);
                        const diasMAX = getDiasMaximo(producto);

                        let texto = '';
                        let color = '';
                        let nivel = '';

                        if (diasStockActual <= diasSS) {
                          // CRÍTICO - Por debajo del Stock de Seguridad
                          texto = clasificacion === 'A' ? '🔴🔴' : '🔴';
                          color = 'text-red-700';
                          nivel = 'CRÍTICO';
                        } else if (diasStockActual <= diasROP) {
                          // URGENTE - Entre SS y ROP (hay que pedir)
                          texto = clasificacion === 'A' ? '🟠🟠' : '🟠';
                          color = 'text-orange-600';
                          nivel = 'URGENTE';
                        } else if (diasStockActual <= diasMAX) {
                          // ÓPTIMO - Entre ROP y MAX (nivel ideal)
                          texto = '✓';
                          color = 'text-green-600';
                          nivel = 'ÓPTIMO';
                        } else {
                          // EXCESO - Por encima del máximo
                          texto = '⚠️';
                          color = 'text-blue-600';
                          nivel = 'EXCESO';
                        }

                        return (
                          <button
                            onClick={() => handleCriticidadClick(producto)}
                            className={`${color} hover:underline cursor-pointer transition-colors font-bold`}
                            title={`${nivel} (Criticidad: ${criticidad})\nStock: ${diasStockActual.toFixed(1)}d | SS: ${diasSS.toFixed(1)}d | ROP: ${diasROP.toFixed(1)}d | MAX: ${diasMAX.toFixed(1)}d`}
                          >
                            {texto}
                          </button>
                        );
                      })() : '-'}
                    </td>
                    <td className="bg-orange-50 px-1 py-1.5 text-xs text-orange-800 text-center font-medium" style={{ width: '45px' }}>
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockSeguridadClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer transition-colors"
                          title={`SS: ${producto.stock_seguridad.toFixed(0)} und | ${getStockSeguridadBultos(producto).toFixed(1)} bultos`}
                        >
                          <span className="font-medium block">{getDiasSeguridad(producto).toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500 block">{getStockSeguridadBultos(producto).toFixed(1)}b</span>
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-1 py-1.5 text-xs text-orange-800 text-center font-medium" style={{ width: '45px' }}>
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockMinimoClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer transition-colors"
                          title={`ROP: ${producto.stock_minimo.toFixed(0)} und | ${getPuntoReordenBultos(producto).toFixed(1)} bultos`}
                        >
                          <span className="font-medium block">{getDiasMinimo(producto).toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500 block">{getPuntoReordenBultos(producto).toFixed(1)}b</span>
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-1 py-1.5 text-xs text-orange-800 text-center font-medium" style={{ width: '45px' }}>
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockMaximoClick(producto)}
                          className="hover:underline cursor-pointer hover:text-orange-900 transition-colors"
                          title={`Max: ${producto.stock_maximo.toFixed(0)} und | ${getStockMaximoBultos(producto).toFixed(1)} bultos`}
                        >
                          <span className="font-medium block">{getDiasMaximo(producto).toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500 block">{getStockMaximoBultos(producto).toFixed(1)}b</span>
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-1 py-1.5 text-center" style={{ width: '50px' }}>
                      {(() => {
                        const sugerido = calcularPedidoSugerido(producto);
                        const diasCobertura = calcularDiasPedidoSugerido(producto);
                        return (
                          <button
                            onClick={() => handlePedidoSugeridoClick(producto)}
                            className={`hover:underline cursor-pointer transition-colors ${sugerido > 0 ? 'text-orange-700 hover:text-orange-900' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Ver cálculo"
                          >
                            <span className="text-xs font-semibold block">{sugerido}</span>
                            {diasCobertura !== null && (
                              <span className="text-[10px] text-gray-500 block">~{Math.round(diasCobertura)}d</span>
                            )}
                          </button>
                        );
                      })()}
                    </td>

                    {/* Columna V2 (Sugerido por Cobertura Real) */}
                    <td className="bg-cyan-50 px-1 py-1.5 text-center" style={{ width: '65px' }}>
                      {producto.v2_cantidad_sugerida_bultos !== undefined && producto.v2_cantidad_sugerida_bultos !== null ? (
                        <button
                          onClick={() => handleCoberturaRealClick(producto)}
                          className="hover:underline cursor-pointer transition-colors"
                          title={`V2: ${producto.v2_cantidad_sugerida_bultos} bultos (clic para detalle)`}
                        >
                          <span className="text-xs font-semibold block text-cyan-700">
                            {producto.v2_cantidad_sugerida_bultos.toFixed(0)}
                          </span>
                          {producto.v2_diferencia_bultos !== undefined && producto.v2_diferencia_bultos !== 0 && (
                            <span className={`text-[10px] block ${producto.v2_diferencia_bultos > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {producto.v2_diferencia_bultos > 0 ? '+' : ''}{producto.v2_diferencia_bultos.toFixed(0)}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>

                    {/* Columnas XYZ - Solo visibles en Modo Consultor */}
                    {modoConsultorActivo && analisisXYZData[producto.codigo_producto] && (() => {
                      const analisis = analisisXYZData[producto.codigo_producto];
                      const diferencia = analisis.explicacion.diferencia_bultos;

                      // Badge para XYZ
                      const getXYZBadge = (clase: string) => {
                        if (clase === 'X') return { text: 'X', color: 'text-green-700 bg-green-100' };
                        if (clase === 'Y') return { text: 'Y', color: 'text-yellow-700 bg-yellow-100' };
                        return { text: 'Z', color: 'text-red-700 bg-red-100' };
                      };
                      const xyzBadge = getXYZBadge(analisis.clasificacion_xyz);

                      return (
                        <>
                          {/* Clasificación XYZ */}
                          <td className="bg-indigo-50 px-2 py-1.5 text-center" style={{ width: '50px' }}>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${xyzBadge.color}`}>
                              {xyzBadge.text}
                            </span>
                          </td>

                          {/* Sugerido XYZ */}
                          <td className="bg-indigo-50 px-2 py-1.5 text-center" style={{ width: '55px' }}>
                            <span className="text-xs font-semibold text-indigo-900">
                              {analisis.stock_calculado.xyz.sugerido}
                            </span>
                          </td>

                          {/* Diferencia (Δ) */}
                          <td className="bg-purple-50 px-2 py-1.5 text-center" style={{ width: '50px' }}>
                            {diferencia === 0 ? (
                              <span className="text-xs font-semibold text-green-700">✅</span>
                            ) : diferencia > 0 ? (
                              <span className="text-xs font-semibold text-red-700">+{diferencia}</span>
                            ) : (
                              <span className="text-xs font-semibold text-blue-700">{diferencia}</span>
                            )}
                          </td>

                          {/* Botón Análisis */}
                          <td className="bg-purple-50 px-2 py-1.5 text-center" style={{ width: '60px' }}>
                            <button
                              onClick={() => handleComparativoClick(producto)}
                              className="text-xs font-medium text-purple-700 hover:text-purple-900 hover:underline transition-colors"
                            >
                              Ver
                            </button>
                          </td>
                        </>
                      );
                    })()}

                    <td className="bg-yellow-50 px-2 py-1.5 text-center" style={{ width: '70px' }}>
                      <input
                        type="number"
                        min="0"
                        value={producto.cantidad_pedida_bultos || 0}
                        onChange={(e) => handleCantidadChange(producto.codigo_producto, e.target.value)}
                        disabled={!producto.incluido}
                        className="w-14 px-1 py-1 border border-gray-300 rounded text-xs text-center font-semibold disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="bg-gray-50 px-2 py-1.5 text-xs text-gray-800 text-center font-medium" style={{ width: '60px' }}>
                      {formatNumber((producto.cantidad_pedida_bultos || 0) * producto.cantidad_bultos * (producto.peso_unidad || 0) / 1000, 2)}
                    </td>
                    <td className="bg-gray-50 px-2 py-1.5 text-center" style={{ width: '120px' }}>
                      <input
                        type="text"
                        value={producto.razon_pedido || ''}
                        onChange={(e) => handleNotasChange(producto.codigo_producto, e.target.value)}
                        placeholder="Notas..."
                        title={producto.warnings_calculo?.length > 0 ? producto.warnings_calculo.join('\n') : (producto.razon_pedido || '')}
                        disabled={!producto.incluido}
                        className={`w-full px-1 py-1 border rounded text-xs text-left disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500 ${
                          producto.ajustado_por_capacidad || producto.ajustado_por_minimo_exhibicion
                            ? 'border-amber-400 bg-amber-50 font-medium'
                            : 'border-gray-300'
                        }`}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {productosOrdenados.length > productosPorPagina && (
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
              <div className="text-xs text-gray-600">
                Mostrando {((paginaActual - 1) * productosPorPagina) + 1} - {Math.min(paginaActual * productosPorPagina, productosOrdenados.length)} de {productosOrdenados.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaActual(1)}
                  disabled={paginaActual === 1}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  «
                </button>
                <button
                  onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                  disabled={paginaActual === 1}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹ Ant
                </button>
                <span className="px-3 py-1 text-xs font-medium bg-white border rounded">
                  {paginaActual} / {Math.ceil(productosOrdenados.length / productosPorPagina)}
                </span>
                <button
                  onClick={() => setPaginaActual(p => Math.min(Math.ceil(productosOrdenados.length / productosPorPagina), p + 1))}
                  disabled={paginaActual >= Math.ceil(productosOrdenados.length / productosPorPagina)}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sig ›
                </button>
                <button
                  onClick={() => setPaginaActual(Math.ceil(productosOrdenados.length / productosPorPagina))}
                  disabled={paginaActual >= Math.ceil(productosOrdenados.length / productosPorPagina)}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Atrás
        </button>
        <button
          onClick={onNext}
          disabled={productosIncluidos.length === 0}
          className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>

      {/* Modal de Análisis de Ventas */}
      {selectedProductoSales && (
        <ProductSalesModal
          isOpen={salesModalOpen}
          onClose={() => setSalesModalOpen(false)}
          codigoProducto={selectedProductoSales.codigo_producto}
          descripcionProducto={selectedProductoSales.descripcion_producto}
          currentUbicacionId={orderData.tienda_destino}
        />
      )}

      {/* Modal de Clasificación ABC */}
      {selectedProductoABC && (
        <ABCComparisonModal
          isOpen={abcModalOpen}
          onClose={() => setAbcModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoABC.codigo_producto,
            descripcion_producto: selectedProductoABC.descripcion_producto,
            abc: getClasificacionABC(selectedProductoABC),
            velocidad_bultos_dia: selectedProductoABC.prom_ventas_20dias_unid / selectedProductoABC.cantidad_bultos,
          }}
          ubicacionId={orderData.tienda_destino}
        />
      )}

      {/* Modal de Stock Mínimo */}
      {selectedProductoStockMin && (
        <StockMinimoModal
          isOpen={stockMinimoModalOpen}
          onClose={() => setStockMinimoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoStockMin.codigo_producto,
            descripcion_producto: selectedProductoStockMin.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoStockMin.prom_ventas_20dias_unid,
            prom_p75_unid: selectedProductoStockMin.prom_p75_unid,
            cantidad_bultos: selectedProductoStockMin.cantidad_bultos,
            clasificacion_abc: selectedProductoStockMin.clasificacion_abc,
            clase_efectiva: selectedProductoStockMin.clase_efectiva,
            es_generador_trafico: selectedProductoStockMin.es_generador_trafico,
            stock_minimo: selectedProductoStockMin.stock_minimo,
            stock_seguridad: selectedProductoStockMin.stock_seguridad,
            punto_reorden: selectedProductoStockMin.punto_reorden,
            metodo_calculo: selectedProductoStockMin.metodo_calculo,
          }}
        />
      )}

      {/* Modal de Stock Seguridad */}
      {selectedProductoStockSeg && (
        <StockSeguridadModal
          isOpen={stockSeguridadModalOpen}
          onClose={() => setStockSeguridadModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoStockSeg.codigo_producto,
            descripcion_producto: selectedProductoStockSeg.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoStockSeg.prom_ventas_20dias_unid,
            prom_p75_unid: selectedProductoStockSeg.prom_p75_unid || 0,
            cantidad_bultos: selectedProductoStockSeg.cantidad_bultos,
            clasificacion_abc: selectedProductoStockSeg.clasificacion_abc,
            clase_efectiva: selectedProductoStockSeg.clase_efectiva,
            es_generador_trafico: selectedProductoStockSeg.es_generador_trafico || false,
            stock_seguridad: selectedProductoStockSeg.stock_seguridad || 0,
            metodo_calculo: selectedProductoStockSeg.metodo_calculo || 'estadistico',
          }}
        />
      )}

      {/* Modal de Stock Máximo */}
      {selectedProductoStockMax && (
        <StockMaximoModal
          isOpen={stockMaximoModalOpen}
          onClose={() => setStockMaximoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoStockMax.codigo_producto,
            descripcion_producto: selectedProductoStockMax.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoStockMax.prom_ventas_20dias_unid,
            prom_p75_unid: selectedProductoStockMax.prom_p75_unid || 0,
            cantidad_bultos: selectedProductoStockMax.cantidad_bultos,
            clasificacion_abc: selectedProductoStockMax.clasificacion_abc,
            clase_efectiva: selectedProductoStockMax.clase_efectiva,
            es_generador_trafico: selectedProductoStockMax.es_generador_trafico || false,
            stock_maximo: selectedProductoStockMax.stock_maximo || 0,
            punto_reorden: selectedProductoStockMax.punto_reorden || selectedProductoStockMax.stock_minimo || 0,
            metodo_calculo: selectedProductoStockMax.metodo_calculo || 'estadistico',
          }}
          configDiasCobertura={configDiasCobertura || undefined}
        />
      )}

      {/* Modal de Días de Stock */}
      {selectedProductoDias && stockParams && (
        <StockDiasModal
          isOpen={stockDiasModalOpen}
          onClose={() => setStockDiasModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoDias.codigo_producto,
            descripcion_producto: selectedProductoDias.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoDias.prom_ventas_20dias_unid,
            prom_p75_unid: selectedProductoDias.prom_p75_unid || 0,
            cantidad_bultos: selectedProductoDias.cantidad_bultos,
            stock_tienda: selectedProductoDias.stock_tienda,
            stock_en_transito: selectedProductoDias.stock_en_transito,
            // Valores reales calculados por el backend
            stock_seguridad: selectedProductoDias.stock_seguridad || 0,
            rop: selectedProductoDias.punto_reorden || 0,
            stock_maximo: selectedProductoDias.stock_maximo || 0,
            clasificacion_abc: selectedProductoDias.clasificacion_abc || '-',
            dias_stock: selectedProductoDias.stock_dias_cobertura || 0,
          }}
          stockParams={{
            stock_min_mult_a: stockParams.stock_min_mult_a,
            stock_min_mult_ab: stockParams.stock_min_mult_ab,
            stock_min_mult_b: stockParams.stock_min_mult_b,
            stock_min_mult_bc: stockParams.stock_min_mult_bc,
            stock_min_mult_c: stockParams.stock_min_mult_c,
            stock_seg_mult_a: stockParams.stock_seg_mult_a,
            stock_seg_mult_ab: stockParams.stock_seg_mult_ab,
            stock_seg_mult_b: stockParams.stock_seg_mult_b,
            stock_seg_mult_bc: stockParams.stock_seg_mult_bc,
            stock_seg_mult_c: stockParams.stock_seg_mult_c,
            stock_max_mult_a: stockParams.stock_max_mult_a,
            stock_max_mult_ab: stockParams.stock_max_mult_ab,
            stock_max_mult_b: stockParams.stock_max_mult_b,
            stock_max_mult_bc: stockParams.stock_max_mult_bc,
            stock_max_mult_c: stockParams.stock_max_mult_c,
          }}
        />
      )}

      {/* Modal de Pedido Sugerido */}
      {selectedProductoPedido && (
        <PedidoSugeridoModal
          isOpen={pedidoSugeridoModalOpen}
          onClose={() => setPedidoSugeridoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoPedido.codigo_producto,
            descripcion_producto: selectedProductoPedido.descripcion_producto,
            prom_p75_unid: selectedProductoPedido.prom_p75_unid || 0,
            cantidad_bultos: selectedProductoPedido.cantidad_bultos,
            stock_tienda: selectedProductoPedido.stock_tienda,
            stock_en_transito: selectedProductoPedido.stock_en_transito,
            stock_cedi_origen: selectedProductoPedido.stock_cedi_origen,
            clasificacion_abc: selectedProductoPedido.clasificacion_abc,
            clase_efectiva: selectedProductoPedido.clase_efectiva,
            es_generador_trafico: selectedProductoPedido.es_generador_trafico || false,
            stock_seguridad: selectedProductoPedido.stock_seguridad || 0,
            stock_minimo: selectedProductoPedido.stock_minimo || 0,
            stock_maximo: selectedProductoPedido.stock_maximo || 0,
            metodo_calculo: selectedProductoPedido.metodo_calculo || 'estadistico',
          }}
        />
      )}

      {/* Modal de Cobertura Real V2 */}
      {selectedProductoCobertura && (
        <CoberturaRealModal
          isOpen={coberturaRealModalOpen}
          onClose={() => setCoberturaRealModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoCobertura.codigo_producto,
            descripcion_producto: selectedProductoCobertura.descripcion_producto,
            cantidad_sugerida_bultos: selectedProductoCobertura.cantidad_sugerida_bultos,
            stock_tienda: selectedProductoCobertura.stock_tienda,
            cantidad_bultos: selectedProductoCobertura.cantidad_bultos,
            prom_p75_unid: selectedProductoCobertura.prom_p75_unid,
            clasificacion_abc: selectedProductoCobertura.clasificacion_abc || undefined,
            v2_prom_dow: selectedProductoCobertura.v2_prom_dow,
            v2_demanda_periodo: selectedProductoCobertura.v2_demanda_periodo,
            v2_cantidad_sugerida_unid: selectedProductoCobertura.v2_cantidad_sugerida_unid,
            v2_cantidad_sugerida_bultos: selectedProductoCobertura.v2_cantidad_sugerida_bultos,
            v2_diferencia_bultos: selectedProductoCobertura.v2_diferencia_bultos,
            v2_cobertura_dias: selectedProductoCobertura.v2_cobertura_dias,
            v2_dias_cobertura_real: selectedProductoCobertura.v2_dias_cobertura_real,
            v2_primer_dia_riesgo: selectedProductoCobertura.v2_primer_dia_riesgo,
            v2_dia_pedido: selectedProductoCobertura.v2_dia_pedido,
            v2_dia_llegada: selectedProductoCobertura.v2_dia_llegada,
            v2_fecha_pedido: selectedProductoCobertura.v2_fecha_pedido,
            v2_fecha_llegada: selectedProductoCobertura.v2_fecha_llegada,
            v2_dias_cobertura_config: selectedProductoCobertura.v2_dias_cobertura_config,
            v2_lead_time_config: selectedProductoCobertura.v2_lead_time_config,
            v2_historico_dow: selectedProductoCobertura.v2_historico_dow,
          }}
        />
      )}

      {/* Modal de Cálculo P75 */}
      {selectedProductoMetodos && (
        <MetodosPromedioModal
          isOpen={metodosPromedioModalOpen}
          onClose={() => setMetodosPromedioModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoMetodos.codigo_producto,
            descripcion_producto: selectedProductoMetodos.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoMetodos.prom_ventas_20dias_unid,
            prom_top3_unid: selectedProductoMetodos.prom_top3_unid,
            prom_p75_unid: selectedProductoMetodos.prom_p75_unid,
            cantidad_bultos: selectedProductoMetodos.cantidad_bultos,
          }}
          ubicacionId={orderData.tienda_destino}
        />
      )}

      {/* Modal de Criticidad */}
      {selectedProductoCriticidad && stockParams && (
        <CriticidadModal
          isOpen={criticidadModalOpen}
          onClose={() => setCriticidadModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoCriticidad.codigo_producto,
            descripcion_producto: selectedProductoCriticidad.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoCriticidad.prom_ventas_20dias_unid,
            prom_p75_unid: selectedProductoCriticidad.prom_p75_unid,
            cantidad_bultos: selectedProductoCriticidad.cantidad_bultos,
            stock_tienda: selectedProductoCriticidad.stock_tienda,
            stock_en_transito: selectedProductoCriticidad.stock_en_transito,
            // Valores del backend para umbrales
            stock_seguridad: selectedProductoCriticidad.stock_seguridad,
            punto_reorden: selectedProductoCriticidad.punto_reorden || selectedProductoCriticidad.stock_minimo,
            stock_maximo: selectedProductoCriticidad.stock_maximo,
            clasificacion_abc: selectedProductoCriticidad.clasificacion_abc || undefined,
          }}
          stockParams={{
            stock_min_mult_a: stockParams.stock_min_mult_a,
            stock_min_mult_ab: stockParams.stock_min_mult_ab,
            stock_min_mult_b: stockParams.stock_min_mult_b,
            stock_min_mult_bc: stockParams.stock_min_mult_bc,
            stock_min_mult_c: stockParams.stock_min_mult_c,
            stock_seg_mult_a: stockParams.stock_seg_mult_a,
            stock_seg_mult_ab: stockParams.stock_seg_mult_ab,
            stock_seg_mult_b: stockParams.stock_seg_mult_b,
            stock_seg_mult_bc: stockParams.stock_seg_mult_bc,
            stock_seg_mult_c: stockParams.stock_seg_mult_c,
            stock_max_mult_a: stockParams.stock_max_mult_a,
            stock_max_mult_ab: stockParams.stock_max_mult_ab,
            stock_max_mult_b: stockParams.stock_max_mult_b,
            stock_max_mult_bc: stockParams.stock_max_mult_bc,
            stock_max_mult_c: stockParams.stock_max_mult_c,
          }}
        />
      )}

      {/* Modal de Histórico de Inventario (Tienda) */}
      {selectedProductoHistorico && (
        <ProductHistoryModal
          isOpen={historicoInventarioModalOpen}
          onClose={() => setHistoricoInventarioModalOpen(false)}
          codigoProducto={selectedProductoHistorico.codigo_producto}
          descripcionProducto={selectedProductoHistorico.descripcion_producto}
          ubicacionId={orderData.tienda_destino}
        />
      )}

      {/* Modal de Histórico de Inventario (CEDI) */}
      {selectedProductoCedi && (
        <ProductHistoryModal
          isOpen={historicoCediModalOpen}
          onClose={() => setHistoricoCediModalOpen(false)}
          codigoProducto={selectedProductoCedi.codigo_producto}
          descripcionProducto={selectedProductoCedi.descripcion_producto}
          ubicacionId={orderData.cedi_origen}
        />
      )}

      {/* Modal de Análisis Comparativo ABC vs XYZ */}
      {selectedProductoComparativo && analisisXYZData[selectedProductoComparativo.codigo_producto] && (
        <ModalAnalisisComparativo
          isOpen={analisisComparativoModalOpen}
          onClose={() => setAnalisisComparativoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoComparativo.codigo_producto,
            descripcion_producto: selectedProductoComparativo.descripcion_producto,
            cantidad_bultos: selectedProductoComparativo.cantidad_bultos,
          }}
          analisisXYZ={analisisXYZData[selectedProductoComparativo.codigo_producto]}
          onUsarABC={handleUsarABC}
          onUsarXYZ={handleUsarXYZ}
        />
      )}
    </div>
  );
}
