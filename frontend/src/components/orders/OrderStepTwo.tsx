import { useState, useEffect, useMemo } from 'react';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import ProductSalesModal from '../sales/ProductSalesModal';
import ABCComparisonModal from './ABCComparisonModal';
import StockMinimoModal from './StockMinimoModal';
import StockSeguridadModal from './StockSeguridadModal';
import StockMaximoModal from './StockMaximoModal';
import StockDiasModal from './StockDiasModal';
import PedidoSugeridoModal from './PedidoSugeridoModal';
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

type SortField = 'prom_20d' | 'stock' | 'sugerido' | 'pedir' | 'abc' | 'criticidad' | 'top3' | 'p75';
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

  useEffect(() => {
    cargarStockParams();
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
        const productosActualizados = productos.map(p => ({
          ...p,
          // Solo calcular si no está definido, de lo contrario preservar el valor del usuario
          cantidad_pedida_bultos: p.cantidad_pedida_bultos !== undefined ? p.cantidad_pedida_bultos : calcularPedidoSugerido(p)
        }));

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

  const cargarProductosSugeridos = async () => {
    try {
      setLoading(true);
      const response = await http.post('/api/pedidos-sugeridos/calcular', {
        cedi_origen: orderData.cedi_origen,
        tienda_destino: orderData.tienda_destino,
        dias_cobertura: 3,
      });

      const productosConDefaults = response.data.map((p: ProductoPedido) => ({
        ...p,
        // No inicializar cantidad_pedida_bultos aquí - dejar que useEffect lo calcule con calcularPedidoSugerido()
        cantidad_pedida_bultos: undefined,
        incluido: true,
      }));

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
      setSortDirection('desc');
    }
  };

  // Obtener categorías únicas de los productos
  const categoriasDisponibles = ['Todas', ...Array.from(new Set(productos.map(p => p.categoria).filter((c): c is string => c !== null && c !== '')))].sort();

  // Cuadrantes ABC-XYZ (9 cuadrantes + Todos)
  const cuadrantesABCXYZ = ['Todos', 'AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];

  // Función para obtener clasificación XYZ basada en coeficiente de variación
  const getClasificacionXYZ = (producto: ProductoPedido): string => {
    // Si no hay ventas, es Z (impredecible)
    if (producto.prom_ventas_20dias_unid <= 0) return 'Z';

    // Calcular coeficiente de variación aproximado usando la diferencia entre 5d y 20d
    const prom5d = producto.prom_ventas_5dias_unid;
    const prom20d = producto.prom_ventas_20dias_unid;

    if (prom20d === 0) return 'Z';

    // CV aproximado: diferencia relativa entre promedios
    const variacion = Math.abs(prom5d - prom20d) / prom20d;

    if (variacion <= 0.2) return 'X';  // Muy estable
    if (variacion <= 0.5) return 'Y';  // Moderadamente variable
    return 'Z';  // Alta variabilidad
  };

  // Filtrar productos por búsqueda, categoría y cuadrante ABC-XYZ
  const productosFiltrados = productos.filter(p => {
    // Filtro por categoría
    if (categoriaActiva !== 'Todas' && p.categoria !== categoriaActiva) {
      return false;
    }

    // Filtro por cuadrante ABC-XYZ
    if (cuadranteActivo !== 'Todos') {
      const abc = getClasificacionABC(p);
      const xyz = getClasificacionXYZ(p);
      if (`${abc}${xyz}` !== cuadranteActivo) {
        return false;
      }
    }

    // Filtro por búsqueda
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.codigo_producto.toLowerCase().includes(term) ||
      p.descripcion_producto.toLowerCase().includes(term)
    );
  });

  // Función auxiliar para calcular clasificación ABC
  const getClasificacionABC = (producto: ProductoPedido): string => {
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    if (ventaDiariaBultos >= 20) return 'A';
    if (ventaDiariaBultos >= 5) return 'AB';
    if (ventaDiariaBultos >= 0.45) return 'B';
    if (ventaDiariaBultos >= 0.20) return 'BC';
    if (ventaDiariaBultos >= 0.001) return 'C';
    return '-';
  };

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

  const calcularStockSeguridad = (producto: ProductoPedido): number => {
    // Usar valor del backend si esta disponible
    if (producto.stock_seguridad > 0) {
      return getStockSeguridadBultos(producto);
    }
    // Fallback a calculo legacy
    if (!stockParams) return 0;
    const ventaDiariaABC = getVelocidadPromBultos(producto);
    const velocidadP75 = getVelocidadP75Bultos(producto);
    let multiplicador = 0;
    if (ventaDiariaABC >= 20) multiplicador = stockParams.stock_seg_mult_a;
    else if (ventaDiariaABC >= 5) multiplicador = stockParams.stock_seg_mult_ab;
    else if (ventaDiariaABC >= 0.45) multiplicador = stockParams.stock_seg_mult_b;
    else if (ventaDiariaABC >= 0.20) multiplicador = stockParams.stock_seg_mult_bc;
    else if (ventaDiariaABC >= 0.001) multiplicador = stockParams.stock_seg_mult_c;
    else return 0;
    return velocidadP75 * multiplicador;
  };

  const calcularPuntoReorden = (producto: ProductoPedido): number => {
    // Usar valor del backend si esta disponible
    if (producto.punto_reorden > 0) {
      return getPuntoReordenBultos(producto);
    }
    // Fallback a calculo legacy
    if (!stockParams) return 0;
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    const stockMin = calcularStockMinimo(producto);
    const stockSeg = calcularStockSeguridad(producto);
    return stockMin + stockSeg + (1.25 * ventaDiariaBultos);
  };

  const calcularStockMaximo = (producto: ProductoPedido): number => {
    // Usar valor del backend si esta disponible
    if (producto.stock_maximo > 0) {
      return getStockMaximoBultos(producto);
    }
    // Fallback a calculo legacy
    if (!stockParams) return 0;
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    let multiplicador = 0;
    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_max_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_max_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_max_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_max_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_max_mult_c;
    else return 0;
    return ventaDiariaBultos * multiplicador;
  };

  const calcularPedidoSugerido = (producto: ProductoPedido): number => {
    if (!stockParams || producto.prom_ventas_20dias_unid <= 0) return 0;

    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const stockTotalBultos = stockTotalUnidades / producto.cantidad_bultos;
    const stockTotalDias = stockTotalUnidades / producto.prom_ventas_20dias_unid;

    // Calcular punto de reorden en días
    const puntoReordenBultos = calcularPuntoReorden(producto);
    const puntoReordenDias = puntoReordenBultos / ventaDiariaBultos;

    // Calcular stock máximo en bultos
    const stockMaximoBultos = calcularStockMaximo(producto);

    // Si Stock Total (días) <= Punto de Reorden (días), necesitamos pedir
    if (stockTotalDias <= puntoReordenDias) {
      // Sugerido = Stock Máximo - Stock Total (en bultos)
      const sugeridoSinLimite = stockMaximoBultos - stockTotalBultos;

      // Limitar al stock disponible en CEDI origen (en bultos)
      const stockCediBultos = producto.stock_cedi_origen / producto.cantidad_bultos;
      const sugerido = Math.min(sugeridoSinLimite, stockCediBultos);

      return Math.max(0, Math.round(sugerido)); // No sugerir valores negativos
    }

    return 0;
  };

  // Calcular cuántos días de cobertura proporciona el pedido sugerido
  // Retorna: días totales de stock después de recibir el pedido
  const calcularDiasPedidoSugerido = (producto: ProductoPedido): number | null => {
    const pedidoBultos = calcularPedidoSugerido(producto);
    if (pedidoBultos <= 0) return null;

    // Usar velocidad P75 (más conservador)
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return null;

    const velocidadP75Bultos = velocidadP75 / producto.cantidad_bultos;
    const stockActualBultos = (producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos;
    const stockResultanteBultos = stockActualBultos + pedidoBultos;

    return stockResultanteBultos / velocidadP75Bultos;
  };

  const esStockCritico = (producto: ProductoPedido): boolean => {
    if (!stockParams || producto.prom_ventas_20dias_unid <= 0) return false;

    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const stockMinimoBultos = calcularStockMinimo(producto);
    const stockMinimoUnidades = stockMinimoBultos * producto.cantidad_bultos;

    return stockTotalUnidades <= stockMinimoUnidades;
  };

  // Función para calcular criticidad (0 = más crítico, mayor número = menos crítico)
  // NOTA: Usa P75 para cálculo de días de stock (más conservador, prepara para picos de demanda)
  const calcularCriticidad = (producto: ProductoPedido): number => {
    try {
      if (!stockParams || !producto || producto.prom_ventas_20dias_unid <= 0) return 999;

    const clasificacion = getClasificacionABC(producto);

    // Usar P75 para cálculo de días (consistente con stock mínimo, seguridad, etc.)
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    const velocidadP75Bultos = velocidadP75 / producto.cantidad_bultos;

    // Calcular stock actual en días usando P75
    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const diasStockActual = velocidadP75 > 0 ? stockTotalUnidades / velocidadP75 : 999;

    // Calcular puntos de control en días (usando P75 para consistencia)
    const stockMinimoBultos = calcularStockMinimo(producto);
    const diasMinimo = velocidadP75Bultos > 0 ? stockMinimoBultos / velocidadP75Bultos : 0;

    const puntoReordenBultos = calcularPuntoReorden(producto);
    const diasReorden = velocidadP75Bultos > 0 ? puntoReordenBultos / velocidadP75Bultos : 0;

    const stockMaximoBultos = calcularStockMaximo(producto);
    const diasMaximo = velocidadP75Bultos > 0 ? stockMaximoBultos / velocidadP75Bultos : 0;

    // Pesos por clasificación ABC (A es más importante)
    const pesoABC = {
      'A': 1,
      'AB': 2,
      'B': 3,
      'BC': 4,
      'C': 5,
      '-': 6
    }[clasificacion] || 6;

    // Determinar nivel de urgencia de stock (5 niveles)
    let urgenciaStock = 0;

    if (diasStockActual <= diasMinimo) {
      // NIVEL 1: CRÍTICO - Por debajo del mínimo (MÁXIMA URGENCIA)
      urgenciaStock = 1;
    } else if (diasStockActual <= diasMinimo + ((diasReorden - diasMinimo) * 0.5)) {
      // NIVEL 2: MUY URGENTE - Entre mínimo y 50% hacia reorden
      urgenciaStock = 2;
    } else if (diasStockActual <= diasReorden) {
      // NIVEL 3: URGENTE - Entre 50% y punto de reorden
      urgenciaStock = 3;
    } else if (diasStockActual <= diasMaximo * 0.8) {
      // NIVEL 4: PREVENTIVO - Entre reorden y 80% del máximo
      urgenciaStock = 4;
    } else {
      // NIVEL 5: ÓPTIMO/EXCESO - Por encima del 80% del máximo
      urgenciaStock = 5;
    }

    // Criticidad combinada: urgenciaStock tiene más peso (x10), luego ABC
    // Menor número = más crítico
    // Ejemplos:
    // - A con stock crítico (≤min): (1 * 10) + 1 = 11 (MÁS CRÍTICO) 🔴🔴🔴
    // - AB con stock crítico: (1 * 10) + 2 = 12 🔴🔴
    // - A muy urgente (50% a reorden): (2 * 10) + 1 = 21 🔴🟠
    // - A urgente (cerca de reorden): (3 * 10) + 1 = 31 🟠
    // - A preventivo: (4 * 10) + 1 = 41 ✓
    // - C con exceso: (5 * 10) + 5 = 55 (MENOS CRÍTICO) ⚠️
    return (urgenciaStock * 10) + pesoABC;
    } catch {
      return 999;
    }
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

    // Caso especial para ABC (ordenamiento alfabético por clasificación)
    if (sortField === 'abc') {
      const abcOrder = { 'A': 1, 'AB': 2, 'B': 3, 'BC': 4, 'C': 5, '-': 6 };
      const aClasif = getClasificacionABC(a);
      const bClasif = getClasificacionABC(b);
      const aOrder = abcOrder[aClasif as keyof typeof abcOrder];
      const bOrder = abcOrder[bClasif as keyof typeof abcOrder];

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
        aValue = a.stock_total;
        bValue = b.stock_total;
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

  const SortableHeader = ({ field, label, bgColor = 'bg-gray-100', width }: { field: SortField; label: string; bgColor?: string; width?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none ${bgColor}`}
      style={width ? { width } : undefined}
    >
      <div className="flex items-center gap-1 justify-center">
        <span>{label}</span>
        {sortField === field && (
          <span className="text-gray-900 text-lg">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  return (
    <div className="w-full px-4 space-y-6">
      {/* Header con información del pedido */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Productos Sugeridos</h2>

        {/* Información origen/destino */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Origen</h3>
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-sm font-medium text-gray-900">{orderData.cedi_origen_nombre}</p>
              <p className="text-xs text-gray-500">CEDI Origen</p>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Destino</h3>
            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-sm font-medium text-gray-900">{orderData.tienda_destino_nombre}</p>
              <p className="text-xs text-gray-500">Tienda Destino</p>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-purple-50 rounded-md px-4 py-3">
            <span className="text-sm text-purple-600">Total Productos: </span>
            <span className="text-xl font-bold text-purple-900">{productos.length}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="🔍 Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Dropdown de Categoría */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Categoría:</label>
            <select
              value={categoriaActiva}
              onChange={(e) => setCategoriaActiva(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white min-w-[150px]"
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

          {/* Dropdown de Cuadrante ABC-XYZ */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">ABC-XYZ:</label>
            <select
              value={cuadranteActivo}
              onChange={(e) => setCuadranteActivo(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            >
              {cuadrantesABCXYZ.map((cuadrante) => {
                const count = productos.filter(p => {
                  if (cuadrante === 'Todos') return true;
                  const abc = getClasificacionABC(p);
                  const xyz = getClasificacionXYZ(p);
                  return `${abc}${xyz}` === cuadrante;
                }).length;
                return (
                  <option key={cuadrante} value={cuadrante}>
                    {cuadrante} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Contador de resultados */}
          {(searchTerm || categoriaActiva !== 'Todas' || cuadranteActivo !== 'Todos') && (
            <div className="text-sm text-gray-500 whitespace-nowrap">
              {productosFiltrados.length} de {productos.length}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de productos */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-600">Cargando productos...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200 text-lg" style={{ minWidth: '2600px' }}>
              <thead className="bg-gray-100">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-100 px-3 py-4 text-left" style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={productos.every(p => p.incluido)}
                      onChange={(e) => {
                        const newProductos = productos.map(p => ({ ...p, incluido: e.target.checked }));
                        setProductos(newProductos);
                        updateOrderData({ productos: newProductos });
                      }}
                      className="h-6 w-6 rounded border-gray-300"
                    />
                  </th>
                  <th className="sticky left-[50px] z-10 bg-blue-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '120px' }}>Código</th>
                  <th className="sticky left-[170px] z-10 bg-blue-100 px-4 py-4 text-left font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '280px' }}>Descripción</th>
                  <th className="bg-blue-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '80px' }}>U/Bto</th>
                  <th className="bg-purple-100 px-3 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '55px' }} title="Análisis de Ventas por Tienda (gráficos, forecast, inventario)">
                    <span className="text-2xl">📈</span>
                  </th>
                  <SortableHeader field="prom_20d" label="20d" bgColor="bg-purple-100" width="85px" />
                  <SortableHeader field="top3" label="TOP3" bgColor="bg-purple-100" width="85px" />
                  <SortableHeader field="p75" label="P75" bgColor="bg-purple-100" width="85px" />
                  <SortableHeader field="stock" label="Stock" bgColor="bg-green-100" width="85px" />
                  <th className="bg-green-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '90px' }}>
                    Tráns.
                  </th>
                  <th className="bg-green-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '85px' }}>
                    Total
                  </th>
                  <th className="bg-green-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '80px' }}>
                    Días
                  </th>
                  <th className="bg-green-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '85px' }}>
                    CEDI
                  </th>
                  <SortableHeader field="abc" label="ABC" bgColor="bg-orange-100" width="70px" />
                  <SortableHeader field="criticidad" label="🔥" bgColor="bg-red-100" width="90px" />
                  <th className="bg-green-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '75px' }}>
                    SS (d)
                  </th>
                  <th className="bg-orange-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '75px' }}>
                    ROP (d)
                  </th>
                  <th className="bg-orange-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '75px' }}>
                    Max (d)
                  </th>
                  <SortableHeader field="sugerido" label="Sugerido" bgColor="bg-gray-100" width="100px" />

                  {/* Columnas XYZ - Solo visibles en Modo Consultor */}
                  {modoConsultorActivo && (
                    <>
                      <th className="bg-indigo-100 px-4 py-4 text-center font-bold text-indigo-900 text-base uppercase whitespace-nowrap" style={{ width: '80px' }}>
                        XYZ ✨
                      </th>
                      <th className="bg-indigo-100 px-4 py-4 text-center font-bold text-indigo-900 text-base uppercase whitespace-nowrap" style={{ width: '90px' }}>
                        Sug. XYZ
                      </th>
                      <th className="bg-purple-100 px-4 py-4 text-center font-bold text-purple-900 text-base uppercase whitespace-nowrap" style={{ width: '80px' }}>
                        Δ
                      </th>
                      <th className="bg-purple-100 px-4 py-4 text-center font-bold text-purple-900 text-base uppercase whitespace-nowrap" style={{ width: '110px' }}>
                        Análisis
                      </th>
                    </>
                  )}

                  <SortableHeader field="pedir" label="Pedir" bgColor="bg-yellow-100" width="95px" />
                  <th className="bg-indigo-50 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '100px' }}>Peso (Kg)</th>
                  <th className="bg-gray-100 px-4 py-4 text-center font-bold text-gray-700 text-base uppercase whitespace-nowrap" style={{ width: '180px' }}>Notas</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productosOrdenados.slice(0, 50).map((producto, index) => {
                  const stockCritico = esStockCritico(producto);
                  return (
                  <tr
                    key={`${producto.codigo_producto}-${index}`}
                    className={`${producto.incluido ? '' : 'opacity-40'} ${stockCritico ? 'bg-red-50 border-l-2 border-red-600' : 'hover:bg-gray-50'}`}
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-3" style={{ width: '50px' }}>
                      <input
                        type="checkbox"
                        checked={producto.incluido || false}
                        onChange={() => handleIncluirChange(producto.codigo_producto)}
                        className="h-6 w-6 rounded border-gray-300"
                      />
                    </td>
                    <td className="sticky left-[50px] z-10 bg-blue-50 px-4 py-3 font-mono text-base font-medium text-gray-900 text-center" style={{ width: '120px' }}>{producto.codigo_producto}</td>
                    <td className="sticky left-[170px] z-10 bg-blue-50 px-4 py-3 text-base text-left truncate" style={{ width: '280px' }}>
                      <span
                        className="text-gray-900 text-left w-full truncate block"
                        title={producto.descripcion_producto}
                      >
                        {producto.descripcion_producto}
                      </span>
                    </td>
                    <td className="bg-blue-50 px-4 py-3 text-base text-gray-700 text-center" style={{ width: '80px' }}>{Math.round(producto.cantidad_bultos)}</td>
                    <td className="bg-purple-50 px-3 py-3 text-center" style={{ width: '55px' }}>
                      <button
                        onClick={() => handleVentasClick(producto)}
                        className="text-purple-600 hover:text-purple-800 hover:scale-110 cursor-pointer transition-all"
                        title="Ver análisis de ventas por tienda (gráficos, forecast, inventario)"
                      >
                        <span className="text-2xl">📈</span>
                      </button>
                    </td>
                    <td className="bg-purple-50 px-4 py-3 text-base text-purple-800 text-center font-medium" style={{ width: '85px' }}>
                      {(producto.prom_ventas_20dias_unid / producto.cantidad_bultos).toFixed(1)}
                    </td>
                    <td className="bg-purple-50 px-4 py-3 text-base text-purple-800 text-center font-medium" style={{ width: '85px' }}>
                      <button
                        onClick={() => handleMetodosPromedioClick(producto)}
                        className="hover:text-purple-900 hover:underline cursor-pointer transition-colors"
                        title="Click para ver comparativa TOP3 vs P75"
                      >
                        {producto.prom_top3_unid ? (producto.prom_top3_unid / producto.cantidad_bultos).toFixed(1) : '-'}
                      </button>
                    </td>
                    <td className="bg-purple-50 px-4 py-3 text-base text-purple-800 text-center font-bold" style={{ width: '85px' }}>
                      <button
                        onClick={() => handleMetodosPromedioClick(producto)}
                        className="hover:text-purple-900 hover:underline cursor-pointer transition-colors"
                        title="Click para ver comparativa TOP3 vs P75"
                      >
                        {producto.prom_p75_unid ? (producto.prom_p75_unid / producto.cantidad_bultos).toFixed(1) : '-'}
                      </button>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-base text-gray-800 text-center font-medium" style={{ width: '85px' }}>
                      <button
                        onClick={() => handleHistoricoInventarioClick(producto)}
                        className="hover:text-green-700 hover:underline cursor-pointer transition-colors"
                        title="Click para ver histórico de inventario"
                      >
                        {formatNumber(producto.stock_tienda / producto.cantidad_bultos, 1)}
                      </button>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-base text-amber-800 text-center font-medium" style={{ width: '90px' }}>
                      {formatNumber(producto.stock_en_transito / producto.cantidad_bultos, 1)}
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-base text-blue-800 text-center font-medium" style={{ width: '85px' }}>
                      {formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos, 1)}
                    </td>
                    <td className={`bg-green-50 px-4 py-3 text-base text-center font-bold ${stockCritico ? 'text-red-700' : 'text-indigo-800'}`} style={{ width: '80px' }}>
                      <button
                        onClick={() => handleStockDiasClick(producto)}
                        className={`hover:underline cursor-pointer transition-colors ${stockCritico ? 'hover:text-red-900' : 'hover:text-indigo-900'}`}
                        title="Click para ver análisis de urgencia de reposición (basado en P75)"
                      >
                        {producto.prom_p75_unid && producto.prom_p75_unid > 0
                          ? ((producto.stock_tienda + producto.stock_en_transito) / producto.prom_p75_unid).toFixed(1)
                          : '∞'
                        }
                      </button>
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-base text-green-800 text-center font-medium" style={{ width: '85px' }}>
                      <button
                        onClick={() => handleHistoricoCediClick(producto)}
                        className="hover:text-green-900 hover:underline cursor-pointer transition-colors"
                        title="Click para ver histórico de inventario en CEDI"
                      >
                        {formatNumber(producto.stock_cedi_origen / producto.cantidad_bultos, 1)}
                      </button>
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-base text-center" style={{ width: '70px' }}>
                      <button
                        onClick={() => handleABCClick(producto)}
                        className={`font-bold hover:underline cursor-pointer transition-colors ${(() => {
                          const clasif = getClasificacionABC(producto);
                          if (clasif === 'A') return 'text-red-700 hover:text-red-900';
                          if (clasif === 'AB') return 'text-orange-700 hover:text-orange-900';
                          if (clasif === 'B') return 'text-yellow-700 hover:text-yellow-900';
                          return 'text-gray-600 hover:text-gray-800';
                        })()}`}
                        title="Click para ver cálculo de clasificación ABC"
                      >
                        {getClasificacionABC(producto)}
                      </button>
                    </td>
                    <td className="bg-red-50 px-4 py-3 text-base text-center font-bold" style={{ width: '90px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (() => {
                        const criticidad = calcularCriticidad(producto);
                        const clasificacion = getClasificacionABC(producto);

                        // Usar P75 para cálculos (consistente con calcularCriticidad)
                        const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
                        const velocidadP75Bultos = velocidadP75 / producto.cantidad_bultos;
                        const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
                        const diasStockActual = velocidadP75 > 0 ? stockTotalUnidades / velocidadP75 : 999;

                        const stockMinimoBultos = calcularStockMinimo(producto);
                        const diasMinimo = velocidadP75Bultos > 0 ? stockMinimoBultos / velocidadP75Bultos : 0;

                        const puntoReordenBultos = calcularPuntoReorden(producto);
                        const diasReorden = velocidadP75Bultos > 0 ? puntoReordenBultos / velocidadP75Bultos : 0;

                        const stockMaximoBultos = calcularStockMaximo(producto);
                        const diasMaximo = velocidadP75Bultos > 0 ? stockMaximoBultos / velocidadP75Bultos : 0;

                        const puntoMedio = diasMinimo + ((diasReorden - diasMinimo) * 0.5);

                        let texto = '';
                        let color = '';
                        let nivel = '';

                        if (diasStockActual <= diasMinimo) {
                          // NIVEL 1: CRÍTICO
                          texto = clasificacion === 'A' ? '🔴🔴🔴' : clasificacion === 'AB' ? '🔴🔴' : '🔴';
                          color = 'text-red-700';
                          nivel = 'CRÍTICO';
                        } else if (diasStockActual <= puntoMedio) {
                          // NIVEL 2: MUY URGENTE
                          texto = clasificacion === 'A' || clasificacion === 'AB' ? '🔴🟠' : '🔴';
                          color = 'text-red-600';
                          nivel = 'MUY URGENTE';
                        } else if (diasStockActual <= diasReorden) {
                          // NIVEL 3: URGENTE
                          texto = clasificacion === 'A' ? '🟠🟠' : '🟠';
                          color = 'text-orange-600';
                          nivel = 'URGENTE';
                        } else if (diasStockActual <= diasMaximo * 0.8) {
                          // NIVEL 4: PREVENTIVO
                          texto = '✓';
                          color = 'text-green-600';
                          nivel = 'PREVENTIVO';
                        } else {
                          // NIVEL 5: ÓPTIMO/EXCESO
                          texto = '⚠️';
                          color = 'text-blue-600';
                          nivel = 'EXCESO';
                        }

                        return (
                          <button
                            onClick={() => handleCriticidadClick(producto)}
                            className={`${color} hover:underline cursor-pointer transition-colors font-bold`}
                            title={`Click para ver cálculo de Criticidad\n${nivel} - Criticidad: ${criticidad}\nStock: ${diasStockActual.toFixed(1)}d | Min: ${diasMinimo.toFixed(1)}d | Reorden: ${diasReorden.toFixed(1)}d | Max: ${diasMaximo.toFixed(1)}d`}
                          >
                            {texto}
                          </button>
                        );
                      })() : '-'}
                    </td>
                    <td className="bg-green-50 px-4 py-3 text-base text-green-800 text-center font-medium" style={{ width: '75px' }}>
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockSeguridadClick(producto)}
                          className="hover:underline hover:text-green-900 cursor-pointer transition-colors font-medium"
                          title={`Stock Seguridad: ${producto.stock_seguridad.toFixed(0)} unidades (${getStockSeguridadBultos(producto).toFixed(1)} bultos)\nMétodo: ${producto.metodo_calculo || 'N/A'}`}
                        >
                          {getDiasSeguridad(producto).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-base text-orange-800 text-center font-medium" style={{ width: '75px' }}>
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockMinimoClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer transition-colors font-medium"
                          title={`Punto de Reorden: ${producto.stock_minimo.toFixed(0)} unidades (${getStockMinimoBultos(producto).toFixed(1)} bultos)\nMétodo: ${producto.metodo_calculo || 'N/A'}`}
                        >
                          {getDiasMinimo(producto).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-4 py-3 text-base text-orange-800 text-center font-medium" style={{ width: '75px' }}>
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockMaximoClick(producto)}
                          className="hover:underline cursor-pointer hover:text-orange-900 transition-colors"
                          title={`Stock Máximo: ${producto.stock_maximo.toFixed(0)} unidades (${getStockMaximoBultos(producto).toFixed(1)} bultos)\nClase: ${producto.clase_efectiva || producto.clasificacion_abc}`}
                        >
                          {getDiasMaximo(producto).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-gray-50 px-4 py-3 text-center" style={{ width: '100px' }}>
                      {(() => {
                        const sugerido = calcularPedidoSugerido(producto);
                        const diasCobertura = calcularDiasPedidoSugerido(producto);
                        return (
                          <button
                            onClick={() => handlePedidoSugeridoClick(producto)}
                            className={`hover:underline cursor-pointer transition-colors ${sugerido > 0 ? 'text-orange-700 hover:text-orange-900' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Click para ver cálculo del pedido sugerido"
                          >
                            <span className="text-base font-bold block">{sugerido}</span>
                            {diasCobertura !== null && (
                              <span className="text-xs text-gray-500 block">~{Math.round(diasCobertura)}d</span>
                            )}
                          </button>
                        );
                      })()}
                    </td>

                    {/* Columnas XYZ - Solo visibles en Modo Consultor */}
                    {modoConsultorActivo && analisisXYZData[producto.codigo_producto] && (() => {
                      const analisis = analisisXYZData[producto.codigo_producto];
                      const diferencia = analisis.explicacion.diferencia_bultos;

                      // Badge para XYZ
                      const getXYZBadge = (clase: string) => {
                        if (clase === 'X') return { text: '⭐ X', color: 'text-green-700 bg-green-100' };
                        if (clase === 'Y') return { text: '⚡ Y', color: 'text-yellow-700 bg-yellow-100' };
                        return { text: '🌀 Z', color: 'text-red-700 bg-red-100' };
                      };
                      const xyzBadge = getXYZBadge(analisis.clasificacion_xyz);

                      return (
                        <>
                          {/* Clasificación XYZ */}
                          <td className="bg-indigo-50 px-4 py-3 text-center" style={{ width: '80px' }}>
                            <span className={`text-base font-bold px-2 py-1 rounded ${xyzBadge.color}`}>
                              {xyzBadge.text}
                            </span>
                          </td>

                          {/* Sugerido XYZ */}
                          <td className="bg-indigo-50 px-4 py-3 text-center" style={{ width: '90px' }}>
                            <span className="text-base font-bold text-indigo-900">
                              {analisis.stock_calculado.xyz.sugerido}
                            </span>
                          </td>

                          {/* Diferencia (Δ) */}
                          <td className="bg-purple-50 px-4 py-3 text-center" style={{ width: '80px' }}>
                            {diferencia === 0 ? (
                              <span className="text-base font-bold text-green-700">✅</span>
                            ) : diferencia > 0 ? (
                              <span className="text-base font-bold text-red-700">🔺 +{diferencia}</span>
                            ) : (
                              <span className="text-base font-bold text-blue-700">🔻 {diferencia}</span>
                            )}
                          </td>

                          {/* Botón Análisis */}
                          <td className="bg-purple-50 px-4 py-3 text-center" style={{ width: '110px' }}>
                            <button
                              onClick={() => handleComparativoClick(producto)}
                              className="text-base font-semibold text-purple-700 hover:text-purple-900 hover:underline transition-colors px-3 py-1.5 bg-purple-200 rounded"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </>
                      );
                    })()}

                    <td className="bg-yellow-50 px-4 py-3 text-center" style={{ width: '95px' }}>
                      <input
                        type="number"
                        min="0"
                        value={producto.cantidad_pedida_bultos || 0}
                        onChange={(e) => handleCantidadChange(producto.codigo_producto, e.target.value)}
                        disabled={!producto.incluido}
                        className="w-20 px-2 py-2 border border-gray-300 rounded text-lg text-center font-bold disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="bg-indigo-50 px-4 py-3 text-base text-indigo-800 text-center font-medium" style={{ width: '100px' }}>
                      {formatNumber((producto.cantidad_pedida_bultos || 0) * producto.cantidad_bultos * (producto.peso_unidad || 0) / 1000, 2)}
                    </td>
                    <td className="bg-gray-50 px-4 py-3 text-center" style={{ width: '180px' }}>
                      <input
                        type="text"
                        value={producto.razon_pedido || ''}
                        onChange={(e) => handleNotasChange(producto.codigo_producto, e.target.value)}
                        placeholder="Notas..."
                        disabled={!producto.incluido}
                        className="w-40 px-3 py-2 border border-gray-300 rounded text-base text-left disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

      {/* Modal de Métodos de Promedio (TOP3 vs P75) */}
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
