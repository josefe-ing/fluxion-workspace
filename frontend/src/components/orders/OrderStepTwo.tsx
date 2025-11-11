import { useState, useEffect, useMemo } from 'react';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import ProductSalesModal from '../sales/ProductSalesModal';
import ABCComparisonModal from './ABCComparisonModal';
import XYZModal from './XYZModal';
import StockMinimoModal from './StockMinimoModal';
import {
  getClasificacionesPorCodigos,
  ClasificacionABCv2,
  getIconoDiscrepancia,
  getDescripcionXYZ
} from '../../services/abcV2Service';
import StockSeguridadModal from './StockSeguridadModal';
import PuntoReordenModal from './PuntoReordenModal';
import StockMaximoModal from './StockMaximoModal';
import StockDiasModal from './StockDiasModal';
import PedidoSugeridoModal from './PedidoSugeridoModal';
import ProyeccionModal from './ProyeccionModal';
import CriticidadModal from './CriticidadModal';
import ModoConsultorToggle from './ModoConsultorToggle';
import ResumenComparativo from './ResumenComparativo';
import ModalAnalisisComparativo from './ModalAnalisisComparativo';
import { formatNumber } from '../../utils/formatNumber';
import { generarAnalisisXYZDummy, generarResumenComparativo, type AnalisisXYZ } from '../../utils/analisisXYZDummy';
import { obtenerAnalisisXYZBatch } from '../../services/analisisXYZ';

interface Props {
  orderData: OrderData;
  updateOrderData: (data: Partial<OrderData>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SortField = 'prom_5d' | 'prom_20d' | 'prom_mismo_dia' | 'stock' | 'sugerido' | 'pedir' | 'abc' | 'abc_v2' | 'criticidad';
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
  const [forecastData, setForecastData] = useState<Record<string, number>>({});
  const [cuadranteActivo, setCuadranteActivo] = useState<string>('CUADRANTE I');
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [selectedProductoSales, setSelectedProductoSales] = useState<ProductoPedido | null>(null);
  const [abcModalOpen, setAbcModalOpen] = useState(false);
  const [selectedProductoABC, setSelectedProductoABC] = useState<ProductoPedido | null>(null);
  const [xyzModalOpen, setXyzModalOpen] = useState(false);
  const [selectedProductoXYZ, setSelectedProductoXYZ] = useState<ProductoPedido | null>(null);
  const [stockMinimoModalOpen, setStockMinimoModalOpen] = useState(false);
  const [selectedProductoStockMin, setSelectedProductoStockMin] = useState<ProductoPedido | null>(null);
  const [stockSeguridadModalOpen, setStockSeguridadModalOpen] = useState(false);
  const [selectedProductoStockSeg, setSelectedProductoStockSeg] = useState<ProductoPedido | null>(null);
  const [puntoReordenModalOpen, setPuntoReordenModalOpen] = useState(false);
  const [selectedProductoReorden, setSelectedProductoReorden] = useState<ProductoPedido | null>(null);
  const [stockMaximoModalOpen, setStockMaximoModalOpen] = useState(false);
  const [selectedProductoStockMax, setSelectedProductoStockMax] = useState<ProductoPedido | null>(null);
  const [stockDiasModalOpen, setStockDiasModalOpen] = useState(false);
  const [selectedProductoDias, setSelectedProductoDias] = useState<ProductoPedido | null>(null);
  const [pedidoSugeridoModalOpen, setPedidoSugeridoModalOpen] = useState(false);
  const [selectedProductoPedido, setSelectedProductoPedido] = useState<ProductoPedido | null>(null);
  const [proyeccionModalOpen, setProyeccionModalOpen] = useState(false);
  const [selectedProductoProyeccion, setSelectedProductoProyeccion] = useState<ProductoPedido | null>(null);
  const [criticidadModalOpen, setCriticidadModalOpen] = useState(false);
  const [selectedProductoCriticidad, setSelectedProductoCriticidad] = useState<ProductoPedido | null>(null);

  // Estados para Modo Consultor IA
  const [modoConsultorActivo, setModoConsultorActivo] = useState(false);
  const [analisisComparativoModalOpen, setAnalisisComparativoModalOpen] = useState(false);
  const [selectedProductoComparativo, setSelectedProductoComparativo] = useState<ProductoPedido | null>(null);
  const [analisisXYZCargando, setAnalisisXYZCargando] = useState(false);
  const [analisisXYZReal, setAnalisisXYZReal] = useState<Record<string, AnalisisXYZ>>({});
  const [usarDatosReales, setUsarDatosReales] = useState(true); // true = API real, false = dummy

  // Estado para ABC v2 (valor económico)
  const [clasificacionesV2, setClasificacionesV2] = useState<Map<string, ClasificacionABCv2>>(new Map());

  useEffect(() => {
    cargarStockParams();
    if (orderData.productos.length > 0) {
      setProductos(orderData.productos);
    } else {
      cargarProductosSugeridos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar forecast cuando cambia el cuadrante activo
  useEffect(() => {
    if (productos.length > 0) {
      cargarForecast();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadranteActivo, productos.length]);

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

  const cargarForecast = async () => {
    try {
      // Esperar a que productos esté cargado
      if (productos.length === 0) return;

      // Filtrar productos por cuadrante activo (igual que en la vista)
      const productosFiltrados = cuadranteActivo === 'Todos'
        ? productos
        : productos.filter(p => p.cuadrante_producto === cuadranteActivo);

      // Si no hay productos en este cuadrante, limpiar forecast
      if (productosFiltrados.length === 0) {
        setForecastData({});
        return;
      }

      // Obtener códigos de productos del cuadrante activo
      const codigosProductos = productosFiltrados.map(p => p.codigo_producto).join(',');

      console.log(`🔮 Cargando forecast para ${productosFiltrados.length} productos del ${cuadranteActivo}`);

      const response = await http.get(
        `/api/forecast/productos?ubicacion_id=${orderData.tienda_destino}&productos=${codigosProductos}&dias_adelante=7`
      );

      if (response.data.success && response.data.forecasts) {
        const forecastMap: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response.data.forecasts.forEach((f: any) => {
          // Usar forecast_diario_bultos en vez de forecast_unidades (total 7 días)
          forecastMap[f.codigo_producto] = f.forecast_diario_bultos || 0;
        });
        setForecastData(forecastMap);
        console.log(`✅ Forecast cargado: ${response.data.forecasts.length} productos`);
      }
    } catch (error) {
      console.error('Error cargando forecast:', error);
    }
  };

  const handleVentasClick = (producto: ProductoPedido) => {
    setSelectedProductoSales(producto);
    setSalesModalOpen(true);
  };

  const handleABCClick = (producto: ProductoPedido) => {
    setSelectedProductoABC(producto);
    setAbcModalOpen(true);
  };

  const handleXYZClick = (producto: ProductoPedido) => {
    setSelectedProductoXYZ(producto);
    setXyzModalOpen(true);
  };

  const handleStockMinimoClick = (producto: ProductoPedido) => {
    setSelectedProductoStockMin(producto);
    setStockMinimoModalOpen(true);
  };

  const handleStockSeguridadClick = (producto: ProductoPedido) => {
    setSelectedProductoStockSeg(producto);
    setStockSeguridadModalOpen(true);
  };

  const handlePuntoReordenClick = (producto: ProductoPedido) => {
    setSelectedProductoReorden(producto);
    setPuntoReordenModalOpen(true);
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

  const handleProyeccionClick = (producto: ProductoPedido) => {
    setSelectedProductoProyeccion(producto);
    setProyeccionModalOpen(true);
  };

  const handleCriticidadClick = (producto: ProductoPedido) => {
    setSelectedProductoCriticidad(producto);
    setCriticidadModalOpen(true);
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

  const cargarClasificacionesABCv2 = async (codigosProductos: string[]) => {
    try {
      // Usar tienda_destino como ubicacion_id para obtener clasificaciones locales
      const clasificaciones = await getClasificacionesPorCodigos(
        codigosProductos,
        orderData.tienda_destino
      );
      setClasificacionesV2(clasificaciones);
      console.log(`✅ ABC v2 + XYZ cargado para ${clasificaciones.size} productos en ${orderData.tienda_destino}`);
    } catch (error) {
      console.warn('ABC v2 no disponible:', error);
      // No es crítico, continuar sin ABC v2
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

      // Cargar clasificaciones ABC v2 después de tener los productos
      if (productosConDefaults.length > 0) {
        const codigos = productosConDefaults.map((p: ProductoPedido) => p.codigo_producto);
        cargarClasificacionesABCv2(codigos);
      }
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

  // Obtener cuadrantes únicos de los productos
  const cuadrantesDisponibles = ['Todos', ...Array.from(new Set(productos.map(p => p.cuadrante_producto).filter((c): c is string => c !== null)))].sort();

  // Filtrar productos por búsqueda y cuadrante
  const productosFiltrados = productos.filter(p => {
    // Filtro por cuadrante
    if (cuadranteActivo !== 'Todos' && p.cuadrante_producto !== cuadranteActivo) {
      return false;
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

  const calcularStockMinimo = (producto: ProductoPedido): number => {
    if (!stockParams) return 0;

    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    let multiplicador = 0;

    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_min_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_min_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_min_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_min_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_min_mult_c;
    else return 0;

    return ventaDiariaBultos * multiplicador;
  };

  const calcularStockSeguridad = (producto: ProductoPedido): number => {
    if (!stockParams) return 0;

    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    let multiplicador = 0;

    if (ventaDiariaBultos >= 20) multiplicador = stockParams.stock_seg_mult_a;
    else if (ventaDiariaBultos >= 5) multiplicador = stockParams.stock_seg_mult_ab;
    else if (ventaDiariaBultos >= 0.45) multiplicador = stockParams.stock_seg_mult_b;
    else if (ventaDiariaBultos >= 0.20) multiplicador = stockParams.stock_seg_mult_bc;
    else if (ventaDiariaBultos >= 0.001) multiplicador = stockParams.stock_seg_mult_c;
    else return 0;

    return ventaDiariaBultos * multiplicador;
  };

  const calcularPuntoReorden = (producto: ProductoPedido): number => {
    if (!stockParams) return 0;

    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    const stockMin = calcularStockMinimo(producto);
    const stockSeg = calcularStockSeguridad(producto);

    return stockMin + stockSeg + (1.25 * ventaDiariaBultos);
  };

  const calcularStockMaximo = (producto: ProductoPedido): number => {
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

  const esStockCritico = (producto: ProductoPedido): boolean => {
    if (!stockParams || producto.prom_ventas_20dias_unid <= 0) return false;

    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const stockMinimoBultos = calcularStockMinimo(producto);
    const stockMinimoUnidades = stockMinimoBultos * producto.cantidad_bultos;

    return stockTotalUnidades <= stockMinimoUnidades;
  };

  // Función para calcular criticidad (0 = más crítico, mayor número = menos crítico)
  const calcularCriticidad = (producto: ProductoPedido): number => {
    if (!stockParams || producto.prom_ventas_20dias_unid <= 0) return 999;

    const clasificacion = getClasificacionABC(producto);
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;

    // Calcular stock actual en días
    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const diasStockActual = stockTotalUnidades / producto.prom_ventas_20dias_unid;

    // Calcular puntos de control en días
    const stockMinimoBultos = calcularStockMinimo(producto);
    const diasMinimo = ventaDiariaBultos > 0 ? stockMinimoBultos / ventaDiariaBultos : 0;

    const puntoReordenBultos = calcularPuntoReorden(producto);
    const diasReorden = ventaDiariaBultos > 0 ? puntoReordenBultos / ventaDiariaBultos : 0;

    const stockMaximoBultos = calcularStockMaximo(producto);
    const diasMaximo = ventaDiariaBultos > 0 ? stockMaximoBultos / ventaDiariaBultos : 0;

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

  // Generar resumen comparativo
  const resumenComparativo = useMemo(() => {
    if (!modoConsultorActivo || Object.keys(analisisXYZData).length === 0) {
      return null;
    }
    return generarResumenComparativo(Object.values(analisisXYZData));
  }, [modoConsultorActivo, analisisXYZData]);

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

    // Caso especial para ABC v2 (ordenamiento por clasificación de valor)
    if (sortField === 'abc_v2') {
      const abcV2Order = { 'A': 1, 'B': 2, 'C': 3, 'NUEVO': 4, 'ERROR_COSTO': 5, 'SIN_MOVIMIENTO': 6, '-': 7 };
      const aClasifV2 = clasificacionesV2.get(a.codigo_producto);
      const bClasifV2 = clasificacionesV2.get(b.codigo_producto);
      const aOrder = abcV2Order[(aClasifV2?.clasificacion_abc_valor || '-') as keyof typeof abcV2Order];
      const bOrder = abcV2Order[(bClasifV2?.clasificacion_abc_valor || '-') as keyof typeof abcV2Order];

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
      case 'prom_5d':
        aValue = a.prom_ventas_5dias_unid;
        bValue = b.prom_ventas_5dias_unid;
        break;
      case 'prom_20d':
        aValue = a.prom_ventas_20dias_unid;
        bValue = b.prom_ventas_20dias_unid;
        break;
      case 'prom_mismo_dia':
        aValue = a.prom_mismo_dia_unid;
        bValue = b.prom_mismo_dia_unid;
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
  const totalBultos = productosIncluidos.reduce((sum, p) => sum + (p.cantidad_pedida_bultos || 0), 0);

  const SortableHeader = ({ field, label, bgColor = 'bg-gray-100', width }: { field: SortField; label: string; bgColor?: string; width?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none ${bgColor}`}
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header con información del pedido */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Productos Sugeridos</h2>

        {/* Modo Consultor IA Toggle */}
        <ModoConsultorToggle
          modoConsultorActivo={modoConsultorActivo}
          onToggle={() => setModoConsultorActivo(!modoConsultorActivo)}
          cargando={analisisXYZCargando}
        />

        {/* Resumen Comparativo (solo visible en Modo Consultor) */}
        {modoConsultorActivo && resumenComparativo && (
          <ResumenComparativo stats={resumenComparativo} />
        )}

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
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-md p-4">
            <div className="text-xs text-blue-600 mb-1">Productos Seleccionados</div>
            <div className="text-2xl font-bold text-blue-900">{productosIncluidos.length}</div>
          </div>
          <div className="bg-green-50 rounded-md p-4">
            <div className="text-xs text-green-600 mb-1">Total Bultos</div>
            <div className="text-2xl font-bold text-green-900">{formatNumber(totalBultos, 2)}</div>
          </div>
          <div className="bg-purple-50 rounded-md p-4">
            <div className="text-xs text-purple-600 mb-1">Total Productos</div>
            <div className="text-2xl font-bold text-purple-900">{productos.length}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-4">
          {/* Búsqueda */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Buscar producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Dropdown de Cuadrantes */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Cuadrante:</label>
            <select
              value={cuadranteActivo}
              onChange={(e) => setCuadranteActivo(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            >
              {cuadrantesDisponibles.map((cuadrante) => {
                const count = productos.filter(p => cuadrante === 'Todos' || p.cuadrante_producto === cuadrante).length;
                return (
                  <option key={cuadrante} value={cuadrante}>
                    {cuadrante} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Contador de resultados */}
          {searchTerm && (
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
            <table className="w-full divide-y divide-gray-200 text-xs" style={{ minWidth: '1400px' }}>
              <thead className="bg-gray-100">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-100 px-1 py-1.5 text-left" style={{ width: '28px' }}>
                    <input
                      type="checkbox"
                      checked={productos.every(p => p.incluido)}
                      onChange={(e) => {
                        const newProductos = productos.map(p => ({ ...p, incluido: e.target.checked }));
                        setProductos(newProductos);
                        updateOrderData({ productos: newProductos });
                      }}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                  </th>
                  <th className="sticky left-7 z-10 bg-blue-100 px-1.5 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '65px' }}>Código</th>
                  <th className="sticky left-[93px] z-10 bg-blue-100 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '110px' }}>Descripción</th>
                  <th className="bg-blue-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '50px' }}>Unid/Bto</th>
                  <SortableHeader field="prom_5d" label="5d" bgColor="bg-purple-100" width="50px" />
                  <SortableHeader field="prom_20d" label="20d" bgColor="bg-purple-100" width="50px" />
                  <SortableHeader field="prom_mismo_dia" label="Mismo Día" bgColor="bg-purple-100" width="70px" />
                  <th className="bg-purple-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '60px' }}>
                    Proyección
                  </th>
                  <SortableHeader field="stock" label="Stock" bgColor="bg-green-100" width="50px" />
                  <th className="bg-green-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '55px' }}>
                    Tránsito
                  </th>
                  <th className="bg-green-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '50px' }}>
                    Total
                  </th>
                  <th className="bg-green-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '45px' }}>
                    Días
                  </th>
                  <th className="bg-green-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '50px' }}>
                    CEDI
                  </th>
                  <SortableHeader field="abc" label="ABC" bgColor="bg-orange-100" width="40px" />
                  {/* Nueva columna ABC v2 (Valor) - Ordenable */}
                  <th
                    onClick={() => handleSort('abc_v2')}
                    className="bg-emerald-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap cursor-pointer hover:bg-emerald-200 select-none"
                    style={{ width: '45px' }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-0.5">
                        <span>ABC</span>
                        {sortField === 'abc_v2' && (
                          <span className="text-gray-900 text-xs">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                      <span className="text-[8px] text-emerald-700">v2 💰</span>
                    </div>
                  </th>
                  <th
                    className="bg-blue-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap"
                    style={{ width: '45px' }}
                    title="XYZ: Variabilidad de demanda"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>XYZ</span>
                      <span className="text-[8px] text-blue-700">📊</span>
                    </div>
                  </th>
                  <SortableHeader field="criticidad" label="🔥" bgColor="bg-red-100" width="60px" />
                  <th className="bg-orange-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '45px' }}>
                    Min
                  </th>
                  <th className="bg-orange-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '70px' }}>
                    Seguridad
                  </th>
                  <th className="bg-orange-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '60px' }}>
                    Reorden
                  </th>
                  <th className="bg-orange-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '45px' }}>
                    Max
                  </th>
                  <SortableHeader field="sugerido" label="Sugerido" bgColor="bg-gray-100" width="60px" />

                  {/* Columnas XYZ - Solo visibles en Modo Consultor */}
                  {modoConsultorActivo && (
                    <>
                      <th className="bg-indigo-100 px-2 py-1.5 text-center font-semibold text-indigo-900 text-[10px] uppercase whitespace-nowrap" style={{ width: '50px' }}>
                        XYZ ✨
                      </th>
                      <th className="bg-indigo-100 px-2 py-1.5 text-center font-semibold text-indigo-900 text-[10px] uppercase whitespace-nowrap" style={{ width: '60px' }}>
                        Sug. XYZ
                      </th>
                      <th className="bg-purple-100 px-2 py-1.5 text-center font-semibold text-purple-900 text-[10px] uppercase whitespace-nowrap" style={{ width: '50px' }}>
                        Δ
                      </th>
                      <th className="bg-purple-100 px-2 py-1.5 text-center font-semibold text-purple-900 text-[10px] uppercase whitespace-nowrap" style={{ width: '80px' }}>
                        Análisis
                      </th>
                    </>
                  )}

                  <SortableHeader field="pedir" label="Pedir" bgColor="bg-yellow-100" width="55px" />
                  <th className="bg-indigo-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '60px' }}>Peso (Kg)</th>
                  <th className="bg-gray-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase whitespace-nowrap" style={{ width: '120px' }}>Notas</th>
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
                    <td className="sticky left-0 z-10 bg-white px-1 py-1" style={{ width: '28px' }}>
                      <input
                        type="checkbox"
                        checked={producto.incluido || false}
                        onChange={() => handleIncluirChange(producto.codigo_producto)}
                        className="h-3 w-3 rounded border-gray-300"
                      />
                    </td>
                    <td className="sticky left-7 z-10 bg-blue-50 px-1.5 py-1 font-mono text-[11px] font-medium text-gray-900 text-center" style={{ width: '65px' }}>{producto.codigo_producto}</td>
                    <td className="sticky left-[93px] z-10 bg-blue-50 px-2 py-1 text-[11px] text-left truncate" style={{ width: '110px' }}>
                      <button
                        onClick={() => handleVentasClick(producto)}
                        className="text-gray-900 hover:text-blue-700 hover:underline cursor-pointer transition-colors text-left w-full truncate"
                        title={`${producto.descripcion_producto}\n\nClick para ver análisis completo de ventas (gráficos, todas las tiendas, forecast)`}
                      >
                        {producto.descripcion_producto}
                      </button>
                    </td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-gray-700 text-center" style={{ width: '50px' }}>{Math.round(producto.cantidad_bultos)}</td>
                    <td className="bg-purple-50 px-2 py-1 text-[11px] text-purple-800 text-center font-medium" style={{ width: '50px' }}>
                      {(producto.prom_ventas_5dias_unid / producto.cantidad_bultos).toFixed(1)}
                    </td>
                    <td className="bg-purple-50 px-2 py-1 text-[11px] text-purple-800 text-center font-medium" style={{ width: '50px' }}>
                      <button
                        onClick={() => handleVentasClick(producto)}
                        className="hover:text-purple-900 hover:underline cursor-pointer font-bold transition-colors"
                        title="Click para ver análisis completo (gráficos, forecast, cálculo 20D)"
                      >
                        {(producto.prom_ventas_20dias_unid / producto.cantidad_bultos).toFixed(1)}
                      </button>
                    </td>
                    <td className="bg-purple-50 px-2 py-1 text-[11px] text-purple-800 text-center font-medium" style={{ width: '70px' }}>
                      {(producto.prom_mismo_dia_unid / producto.cantidad_bultos).toFixed(1)}
                    </td>
                    <td className="bg-purple-50 px-2 py-1 text-[11px] text-purple-800 text-center font-medium" style={{ width: '60px' }}>
                      {forecastData[producto.codigo_producto] ? (
                        <button
                          onClick={() => handleProyeccionClick(producto)}
                          className="hover:text-purple-900 hover:underline cursor-pointer font-bold transition-colors"
                          title="Click para ver cálculo de la Proyección PMP"
                        >
                          {forecastData[producto.codigo_producto].toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-gray-800 text-center font-medium" style={{ width: '50px' }}>
                      {formatNumber(producto.stock_tienda / producto.cantidad_bultos, 1)}
                    </td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-amber-800 text-center font-medium" style={{ width: '55px' }}>
                      {formatNumber(producto.stock_en_transito / producto.cantidad_bultos, 1)}
                    </td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-blue-800 text-center font-medium" style={{ width: '50px' }}>
                      {formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos, 1)}
                    </td>
                    <td className={`bg-green-50 px-2 py-1 text-[11px] text-center font-bold ${stockCritico ? 'text-red-700' : 'text-indigo-800'}`} style={{ width: '45px' }}>
                      <button
                        onClick={() => handleStockDiasClick(producto)}
                        className={`hover:underline cursor-pointer transition-colors ${stockCritico ? 'hover:text-red-900' : 'hover:text-indigo-900'}`}
                        title="Click para ver análisis de urgencia de reposición"
                      >
                        {producto.prom_ventas_20dias_unid > 0
                          ? ((producto.stock_tienda + producto.stock_en_transito) / producto.prom_ventas_20dias_unid).toFixed(1)
                          : '∞'
                        }
                      </button>
                    </td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-800 text-center font-medium" style={{ width: '50px' }}>
                      {formatNumber(producto.stock_cedi_origen / producto.cantidad_bultos, 1)}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-center" style={{ width: '40px' }}>
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
                    {/* Nueva celda ABC v2 (Valor) */}
                    <td
                      onClick={() => handleABCClick(producto)}
                      className="bg-emerald-50 px-2 py-1 text-center cursor-pointer hover:bg-emerald-100 transition-colors"
                      style={{ width: '45px' }}
                      title="ABC v2 basado en valor económico"
                    >
                      {(() => {
                        const claseV2 = clasificacionesV2.get(producto.codigo_producto);
                        if (!claseV2) {
                          return <span className="text-gray-400 text-[10px]">-</span>;
                        }

                        const icono = getIconoDiscrepancia(claseV2);
                        let colorClase = '';

                        if (claseV2.clasificacion_abc_valor === 'A') {
                          colorClase = 'text-red-700 font-bold';
                        } else if (claseV2.clasificacion_abc_valor === 'B') {
                          colorClase = 'text-yellow-700 font-semibold';
                        } else if (claseV2.clasificacion_abc_valor === 'C') {
                          colorClase = 'text-gray-600 font-medium';
                        }

                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-[11px] ${colorClase}`}>
                              {claseV2.clasificacion_abc_valor}
                            </span>
                            {claseV2.tiene_discrepancia && (
                              <span className="text-[10px]" title={claseV2.tipo_discrepancia}>
                                {icono}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Nueva columna XYZ (Variabilidad) */}
                    <td
                      onClick={() => handleXYZClick(producto)}
                      className="bg-blue-50 px-2 py-1 text-center cursor-pointer hover:bg-blue-100 transition-colors"
                      style={{ width: '45px' }}
                      title={(() => {
                        const claseV2 = clasificacionesV2.get(producto.codigo_producto);
                        if (!claseV2?.clasificacion_xyz) return 'Sin clasificación XYZ - Click para más info';
                        return `${getDescripcionXYZ(claseV2.clasificacion_xyz)}\nCV: ${claseV2.coeficiente_variacion?.toFixed(2) || 'N/A'}\n\nClick para ver análisis detallado`;
                      })()}
                    >
                      {(() => {
                        const claseV2 = clasificacionesV2.get(producto.codigo_producto);
                        if (!claseV2?.clasificacion_xyz) {
                          return <span className="text-gray-400 text-[10px]">-</span>;
                        }

                        const matriz = claseV2.matriz_abc_xyz;
                        let colorClase = '';

                        // Colores por XYZ
                        if (claseV2.clasificacion_xyz === 'X') {
                          colorClase = 'text-green-700 font-semibold';
                        } else if (claseV2.clasificacion_xyz === 'Y') {
                          colorClase = 'text-yellow-700 font-semibold';
                        } else if (claseV2.clasificacion_xyz === 'Z') {
                          colorClase = 'text-red-700 font-bold';
                        }

                        // Mostrar matriz completa (ej: AX, BZ) en vez de solo X/Y/Z
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-[10px] ${colorClase}`}>
                              {matriz || claseV2.clasificacion_xyz}
                            </span>
                            {claseV2.es_extremadamente_volatil && (
                              <span className="text-[10px]" title="Extremadamente volátil (CV > 2.0)">
                                ⚡
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="bg-red-50 px-2 py-1 text-[10px] text-center font-bold" style={{ width: '60px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (() => {
                        const criticidad = calcularCriticidad(producto);
                        const clasificacion = getClasificacionABC(producto);
                        const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
                        const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
                        const diasStockActual = stockTotalUnidades / producto.prom_ventas_20dias_unid;

                        const stockMinimoBultos = calcularStockMinimo(producto);
                        const diasMinimo = ventaDiariaBultos > 0 ? stockMinimoBultos / ventaDiariaBultos : 0;

                        const puntoReordenBultos = calcularPuntoReorden(producto);
                        const diasReorden = ventaDiariaBultos > 0 ? puntoReordenBultos / ventaDiariaBultos : 0;

                        const stockMaximoBultos = calcularStockMaximo(producto);
                        const diasMaximo = ventaDiariaBultos > 0 ? stockMaximoBultos / ventaDiariaBultos : 0;

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
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium" style={{ width: '45px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handleStockMinimoClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer transition-colors font-medium"
                          title="Click para ver cálculo de Stock Mínimo"
                        >
                          {(calcularStockMinimo(producto) / (producto.prom_ventas_20dias_unid / producto.cantidad_bultos)).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium" style={{ width: '70px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handleStockSeguridadClick(producto)}
                          className="hover:underline hover:text-blue-900 cursor-pointer transition-colors font-medium"
                          title="Click para ver cálculo de Stock de Seguridad"
                        >
                          {(calcularStockSeguridad(producto) / (producto.prom_ventas_20dias_unid / producto.cantidad_bultos)).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium" style={{ width: '60px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handlePuntoReordenClick(producto)}
                          className="hover:underline hover:text-indigo-900 cursor-pointer transition-colors font-medium"
                          title="Click para ver cálculo de Punto de Reorden"
                        >
                          {(calcularPuntoReorden(producto) / (producto.prom_ventas_20dias_unid / producto.cantidad_bultos)).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium" style={{ width: '45px' }}>
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handleStockMaximoClick(producto)}
                          className="hover:underline cursor-pointer hover:text-orange-900 transition-colors"
                          title="Click para ver cálculo de Stock Máximo"
                        >
                          {(calcularStockMaximo(producto) / (producto.prom_ventas_20dias_unid / producto.cantidad_bultos)).toFixed(1)}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="bg-gray-50 px-2 py-1 text-center" style={{ width: '60px' }}>
                      <button
                        onClick={() => handlePedidoSugeridoClick(producto)}
                        className={`text-[11px] font-bold hover:underline cursor-pointer transition-colors ${calcularPedidoSugerido(producto) > 0 ? 'text-orange-700 hover:text-orange-900' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Click para ver cálculo del pedido sugerido"
                      >
                        {calcularPedidoSugerido(producto)}
                      </button>
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
                          <td className="bg-indigo-50 px-2 py-1 text-center" style={{ width: '50px' }}>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${xyzBadge.color}`}>
                              {xyzBadge.text}
                            </span>
                          </td>

                          {/* Sugerido XYZ */}
                          <td className="bg-indigo-50 px-2 py-1 text-center" style={{ width: '60px' }}>
                            <span className="text-[11px] font-bold text-indigo-900">
                              {analisis.stock_calculado.xyz.sugerido}
                            </span>
                          </td>

                          {/* Diferencia (Δ) */}
                          <td className="bg-purple-50 px-2 py-1 text-center" style={{ width: '50px' }}>
                            {diferencia === 0 ? (
                              <span className="text-[11px] font-bold text-green-700">✅</span>
                            ) : diferencia > 0 ? (
                              <span className="text-[11px] font-bold text-red-700">🔺 +{diferencia}</span>
                            ) : (
                              <span className="text-[11px] font-bold text-blue-700">🔻 {diferencia}</span>
                            )}
                          </td>

                          {/* Botón Análisis */}
                          <td className="bg-purple-50 px-2 py-1 text-center" style={{ width: '80px' }}>
                            <button
                              onClick={() => handleComparativoClick(producto)}
                              className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 hover:underline transition-colors px-2 py-1 bg-purple-200 rounded"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </>
                      );
                    })()}

                    <td className="bg-yellow-50 px-2 py-1 text-center" style={{ width: '55px' }}>
                      <input
                        type="number"
                        min="0"
                        value={producto.cantidad_pedida_bultos || 0}
                        onChange={(e) => handleCantidadChange(producto.codigo_producto, e.target.value)}
                        disabled={!producto.incluido}
                        className="w-14 px-1 py-0.5 border border-gray-300 rounded text-[11px] text-center font-bold disabled:bg-gray-100 focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="bg-indigo-50 px-2 py-1 text-[11px] text-indigo-800 text-center font-medium" style={{ width: '60px' }}>
                      {formatNumber((producto.cantidad_pedida_bultos || 0) * producto.cantidad_bultos * (producto.peso_unidad || 0) / 1000, 2)}
                    </td>
                    <td className="bg-gray-50 px-2 py-1 text-center" style={{ width: '120px' }}>
                      <input
                        type="text"
                        value={producto.razon_pedido || ''}
                        onChange={(e) => handleNotasChange(producto.codigo_producto, e.target.value)}
                        placeholder="Notas..."
                        disabled={!producto.incluido}
                        className="w-32 px-1 py-0.5 border border-gray-300 rounded text-[10px] text-left disabled:bg-gray-100 focus:ring-1 focus:ring-blue-500"
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

      {/* Modal de Clasificación ABC - Comparación v1 vs v2 */}
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

      {/* Modal de Clasificación XYZ - Variabilidad Detallada */}
      {selectedProductoXYZ && (
        <XYZModal
          isOpen={xyzModalOpen}
          onClose={() => setXyzModalOpen(false)}
          clasificacion={clasificacionesV2.get(selectedProductoXYZ.codigo_producto) || null}
          producto={{
            codigo_producto: selectedProductoXYZ.codigo_producto,
            descripcion_producto: selectedProductoXYZ.descripcion_producto,
          }}
        />
      )}

      {/* Modal de Stock Mínimo */}
      {selectedProductoStockMin && stockParams && (
        <StockMinimoModal
          isOpen={stockMinimoModalOpen}
          onClose={() => setStockMinimoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoStockMin.codigo_producto,
            descripcion_producto: selectedProductoStockMin.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoStockMin.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoStockMin.cantidad_bultos,
          }}
          stockParams={{
            stock_min_mult_a: stockParams.stock_min_mult_a,
            stock_min_mult_ab: stockParams.stock_min_mult_ab,
            stock_min_mult_b: stockParams.stock_min_mult_b,
            stock_min_mult_bc: stockParams.stock_min_mult_bc,
            stock_min_mult_c: stockParams.stock_min_mult_c,
          }}
        />
      )}

      {/* Modal de Stock Seguridad */}
      {selectedProductoStockSeg && stockParams && (
        <StockSeguridadModal
          isOpen={stockSeguridadModalOpen}
          onClose={() => setStockSeguridadModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoStockSeg.codigo_producto,
            descripcion_producto: selectedProductoStockSeg.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoStockSeg.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoStockSeg.cantidad_bultos,
          }}
          stockParams={{
            stock_seg_mult_a: stockParams.stock_seg_mult_a,
            stock_seg_mult_ab: stockParams.stock_seg_mult_ab,
            stock_seg_mult_b: stockParams.stock_seg_mult_b,
            stock_seg_mult_bc: stockParams.stock_seg_mult_bc,
            stock_seg_mult_c: stockParams.stock_seg_mult_c,
          }}
        />
      )}

      {/* Modal de Punto de Reorden */}
      {selectedProductoReorden && stockParams && (
        <PuntoReordenModal
          isOpen={puntoReordenModalOpen}
          onClose={() => setPuntoReordenModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoReorden.codigo_producto,
            descripcion_producto: selectedProductoReorden.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoReorden.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoReorden.cantidad_bultos,
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
          }}
        />
      )}

      {/* Modal de Stock Máximo */}
      {selectedProductoStockMax && stockParams && (
        <StockMaximoModal
          isOpen={stockMaximoModalOpen}
          onClose={() => setStockMaximoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoStockMax.codigo_producto,
            descripcion_producto: selectedProductoStockMax.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoStockMax.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoStockMax.cantidad_bultos,
          }}
          stockParams={{
            stock_max_mult_a: stockParams.stock_max_mult_a,
            stock_max_mult_ab: stockParams.stock_max_mult_ab,
            stock_max_mult_b: stockParams.stock_max_mult_b,
            stock_max_mult_bc: stockParams.stock_max_mult_bc,
            stock_max_mult_c: stockParams.stock_max_mult_c,
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
      {selectedProductoPedido && stockParams && (
        <PedidoSugeridoModal
          isOpen={pedidoSugeridoModalOpen}
          onClose={() => setPedidoSugeridoModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoPedido.codigo_producto,
            descripcion_producto: selectedProductoPedido.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoPedido.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoPedido.cantidad_bultos,
            stock_tienda: selectedProductoPedido.stock_tienda,
            stock_en_transito: selectedProductoPedido.stock_en_transito,
            stock_cedi_origen: selectedProductoPedido.stock_cedi_origen,
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

      {/* Modal de Proyección PMP */}
      {selectedProductoProyeccion && forecastData[selectedProductoProyeccion.codigo_producto] && (
        <ProyeccionModal
          isOpen={proyeccionModalOpen}
          onClose={() => setProyeccionModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoProyeccion.codigo_producto,
            descripcion_producto: selectedProductoProyeccion.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoProyeccion.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoProyeccion.cantidad_bultos,
          }}
          forecastDiarioBultos={forecastData[selectedProductoProyeccion.codigo_producto]}
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
