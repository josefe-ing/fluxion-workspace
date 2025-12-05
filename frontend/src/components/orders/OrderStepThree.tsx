import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import { formatNumber } from '../../utils/formatNumber';
import ProductSalesModal from '../sales/ProductSalesModal';
import ABCClassificationModal from './ABCClassificationModal';
import StockMinimoModal from './StockMinimoModal';
import StockSeguridadModal from './StockSeguridadModal';
import PuntoReordenModal from './PuntoReordenModal';
import StockMaximoModal from './StockMaximoModal';
import StockDiasModal from './StockDiasModal';
import PedidoSugeridoModal from './PedidoSugeridoModal';
import CriticidadModal from './CriticidadModal';

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

interface Props {
  orderData: OrderData;
  onBack: () => void;
}

export default function OrderStepThree({ orderData, onBack }: Props) {
  const navigate = useNavigate();
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [stockParams, setStockParams] = useState<StockParams>({
    stock_min_mult_a: 2.0,
    stock_min_mult_ab: 2.0,
    stock_min_mult_b: 3.0,
    stock_min_mult_bc: 3.5,
    stock_min_mult_c: 4.0,
    stock_seg_mult_a: 0.5,
    stock_seg_mult_ab: 0.5,
    stock_seg_mult_b: 0.75,
    stock_seg_mult_bc: 1.0,
    stock_seg_mult_c: 1.5,
    stock_max_mult_a: 7.0,
    stock_max_mult_ab: 7.0,
    stock_max_mult_b: 10.0,
    stock_max_mult_bc: 14.0,
    stock_max_mult_c: 21.0,
  });

  // Estados para modales
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [selectedProductoSales, setSelectedProductoSales] = useState<ProductoPedido | null>(null);
  const [abcModalOpen, setAbcModalOpen] = useState(false);
  const [selectedProductoABC, setSelectedProductoABC] = useState<ProductoPedido | null>(null);
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
  const [criticidadModalOpen, setCriticidadModalOpen] = useState(false);
  const [selectedProductoCriticidad, setSelectedProductoCriticidad] = useState<ProductoPedido | null>(null);

  // Cargar parámetros de stock al montar componente
  useEffect(() => {
    const cargarStockParams = async () => {
      try {
        const response = await http.get(`/api/ubicaciones/${orderData.tienda_destino}/stock-params`);
        setStockParams(response.data);
      } catch (error) {
        console.error('Error cargando parámetros de stock:', error);
        // Mantener valores por defecto ya establecidos en useState
      }
    };

    if (orderData.tienda_destino) {
      cargarStockParams();
    }
  }, [orderData.tienda_destino]);

  // Filtrar productos incluidos Y con cantidad pedida > 0
  const productosIncluidos = orderData.productos.filter(p => {
    const cantidadPedida = p.cantidad_pedida_bultos || 0;
    const incluido = p.incluido !== false; // Si no está definido, lo consideramos incluido
    const tienePedido = cantidadPedida > 0;

    console.log(`Producto ${p.codigo_producto}: incluido=${incluido}, cantidad_pedida=${cantidadPedida}, pasa filtro=${incluido && tienePedido}`);

    return incluido && tienePedido;
  });

  // Función para clasificación ABC
  const getClasificacionABC = (producto: ProductoPedido): string => {
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    if (ventaDiariaBultos >= 20) return 'A';
    if (ventaDiariaBultos >= 5) return 'AB';
    if (ventaDiariaBultos >= 0.45) return 'B';
    if (ventaDiariaBultos >= 0.20) return 'BC';
    if (ventaDiariaBultos >= 0.001) return 'C';
    return '-';
  };

  // Funciones de cálculo de stock (igual que en OrderStepTwo)
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

  // Función para calcular criticidad y emoji
  const calcularCriticidadDisplay = (producto: ProductoPedido) => {
    if (producto.prom_ventas_20dias_unid <= 0) {
      return { emoji: '-', color: 'text-gray-400' };
    }

    const clasificacion = getClasificacionABC(producto);
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    const diasStockActual = stockTotalUnidades / producto.prom_ventas_20dias_unid;

    // Calcular puntos de control en días usando funciones de cálculo (igual que OrderStepTwo)
    const stockMinimoBultos = calcularStockMinimo(producto);
    const diasMinimo = ventaDiariaBultos > 0 ? stockMinimoBultos / ventaDiariaBultos : 0;

    const puntoReordenBultos = calcularPuntoReorden(producto);
    const diasReorden = ventaDiariaBultos > 0 ? puntoReordenBultos / ventaDiariaBultos : 0;

    const stockMaximoBultos = calcularStockMaximo(producto);
    const diasMaximo = ventaDiariaBultos > 0 ? stockMaximoBultos / ventaDiariaBultos : 0;

    const puntoMedio = diasMinimo + ((diasReorden - diasMinimo) * 0.5);

    let emoji = '';
    let color = '';

    if (diasStockActual <= diasMinimo) {
      // NIVEL 1: CRÍTICO
      emoji = clasificacion === 'A' ? '🔴🔴🔴' : clasificacion === 'AB' ? '🔴🔴' : '🔴';
      color = 'text-red-700';
    } else if (diasStockActual <= puntoMedio) {
      // NIVEL 2: MUY URGENTE
      emoji = clasificacion === 'A' || clasificacion === 'AB' ? '🔴🟠' : '🔴';
      color = 'text-red-600';
    } else if (diasStockActual <= diasReorden) {
      // NIVEL 3: URGENTE
      emoji = clasificacion === 'A' ? '🟠🟠' : '🟠';
      color = 'text-orange-600';
    } else if (diasStockActual <= diasMaximo * 0.8) {
      // NIVEL 4: PREVENTIVO
      emoji = '✓';
      color = 'text-green-600';
    } else {
      // NIVEL 5: ÓPTIMO/EXCESO
      emoji = '⚠️';
      color = 'text-blue-600';
    }

    return { emoji, color };
  };

  // Handlers para modales
  const handleSalesClick = (producto: ProductoPedido) => {
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

  const handleCriticidadClick = (producto: ProductoPedido) => {
    setSelectedProductoCriticidad(producto);
    setCriticidadModalOpen(true);
  };

  // Ordenar por cuadrante y luego por criticidad (usando useMemo para evitar recalcular)
  const productosOrdenados = useMemo(() => {
    return [...productosIncluidos].sort((a, b) => {
      // Primero por cuadrante (usando cuadrante_producto)
      const cuadranteA = a.cuadrante_producto || 'ZZZ';
      const cuadranteB = b.cuadrante_producto || 'ZZZ';

      if (cuadranteA !== cuadranteB) {
        return cuadranteA.localeCompare(cuadranteB);
      }

      // Luego por criticidad (calculada - más urgente primero)
      const criticidadA = calcularCriticidadDisplay(a);
      const criticidadB = calcularCriticidadDisplay(b);

      // Orden de prioridad: 🔴🔴🔴 > 🔴🔴 > 🔴🟠 > 🔴 > 🟠🟠 > 🟠 > ✓ > ⚠️
      const prioridadEmoji: {[key: string]: number} = {
        '🔴🔴🔴': 1,
        '🔴🔴': 2,
        '🔴🟠': 3,
        '🔴': 4,
        '🟠🟠': 5,
        '🟠': 6,
        '✓': 7,
        '⚠️': 8,
        '-': 9
      };

      const prioA = prioridadEmoji[criticidadA.emoji] || 10;
      const prioB = prioridadEmoji[criticidadB.emoji] || 10;

      return prioA - prioB;
    });
  }, [productosIncluidos]);

  const totalBultos = productosOrdenados.reduce((sum, p) => sum + (p.cantidad_pedida_bultos || 0), 0);

  const handleSubmit = async (enviar: boolean = false) => {
    setLoading(true);
    try {
      const payload = {
        cedi_origen: orderData.cedi_origen,
        cedi_origen_nombre: orderData.cedi_origen_nombre,
        tienda_destino: orderData.tienda_destino,
        tienda_destino_nombre: orderData.tienda_destino_nombre,
        dias_cobertura: 3,
        productos: orderData.productos,
        observaciones: observaciones,
        enviar_aprobacion: enviar  // Enviar para aprobación del gerente si es true
      };

      console.log('Guardando pedido:', payload);
      const response = await http.post('/api/pedidos-sugeridos', payload);
      console.log('Pedido guardado:', response.data);

      const mensaje = enviar
        ? `¡Pedido ${response.data.numero_pedido} enviado para aprobación del gerente!`
        : `¡Pedido ${response.data.numero_pedido} guardado como borrador!`;

      alert(mensaje);
      navigate('/pedidos-sugeridos');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error creando pedido:', error);
      const mensaje = error.response?.data?.detail || 'Error al crear el pedido';
      alert(mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header con información del pedido */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Confirmación de Pedido</h2>

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
            <div className="text-2xl font-bold text-blue-900">{productosOrdenados.length}</div>
          </div>
          <div className="bg-green-50 rounded-md p-4">
            <div className="text-xs text-green-600 mb-1">Total Bultos</div>
            <div className="text-2xl font-bold text-green-900">{formatNumber(totalBultos, 2)}</div>
          </div>
          <div className="bg-purple-50 rounded-md p-4">
            <div className="text-xs text-purple-600 mb-1">Total Productos</div>
            <div className="text-2xl font-bold text-purple-900">{orderData.productos.length}</div>
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            placeholder="Agregar notas o instrucciones especiales para el pedido..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabla de productos con todas las columnas */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-xs" style={{ minWidth: '1400px' }}>
            <thead className="bg-gray-100">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '80px' }}>Código</th>
                <th className="bg-gray-100 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase" style={{ minWidth: '200px' }}>Descripción</th>
                <th className="bg-gray-100 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '65px' }}>¿Bulto?</th>
                <th className="bg-blue-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '40px' }}>5D</th>
                <th className="bg-blue-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '40px' }}>20D</th>
                <th className="bg-blue-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Mismo Día</th>
                <th className="bg-purple-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Proyección</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Stock</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Tránsito</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Total</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '45px' }}>Días</th>
                <th className="bg-green-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>CEDI</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '40px' }}>ABC</th>
                <th className="bg-red-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>🔥</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '45px' }}>Min</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '70px' }}>Seguridad</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '70px' }}>Pto. Reorden</th>
                <th className="bg-orange-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Máx</th>
                <th className="bg-yellow-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Sugerido</th>
                <th className="bg-yellow-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '50px' }}>Pedir</th>
                <th className="bg-indigo-50 px-2 py-1.5 text-center font-semibold text-gray-700 text-[10px] uppercase" style={{ width: '60px' }}>Peso (Kg)</th>
                <th className="bg-yellow-50 px-2 py-1.5 text-left font-semibold text-gray-700 text-[10px] uppercase" style={{ minWidth: '150px' }}>Notas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productosOrdenados.map((producto, index) => {
                const clasificacion = getClasificacionABC(producto);
                const criticidad = calcularCriticidadDisplay(producto);
                const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;

                return (
                  <tr key={`${producto.codigo_producto}-${index}`} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1 text-[11px] font-medium text-gray-900">{producto.codigo_producto}</td>
                    <td className="px-2 py-1 text-[11px] text-gray-900">{producto.descripcion_producto}</td>
                    <td className="bg-gray-50 px-2 py-1 text-[11px] text-gray-700 text-center">{producto.cantidad_bultos}</td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-blue-800 text-center">{formatNumber(producto.prom_ventas_5dias_unid / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-blue-800 text-center font-medium">
                      <button
                        onClick={() => handleSalesClick(producto)}
                        className="hover:underline cursor-pointer hover:text-blue-900"
                        title="Click para ver análisis de ventas"
                      >
                        {formatNumber(producto.prom_ventas_20dias_unid / producto.cantidad_bultos, 1)}
                      </button>
                    </td>
                    <td className="bg-blue-50 px-2 py-1 text-[11px] text-blue-800 text-center">{formatNumber(producto.prom_mismo_dia_unid / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-purple-50 px-2 py-1 text-[11px] text-purple-800 text-center font-medium">-</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-indigo-800 text-center">{formatNumber(producto.stock_tienda / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-700 text-center">{formatNumber(producto.stock_en_transito / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-800 text-center font-medium">{formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-center font-bold">
                      <button
                        onClick={() => handleStockDiasClick(producto)}
                        className="hover:underline cursor-pointer hover:text-indigo-900"
                        title="Click para ver análisis de urgencia de reposición"
                      >
                        {producto.prom_ventas_20dias_unid > 0
                          ? formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.prom_ventas_20dias_unid, 1)
                          : '∞'
                        }
                      </button>
                    </td>
                    <td className="bg-green-50 px-2 py-1 text-[11px] text-green-800 text-center font-medium">{formatNumber(producto.stock_cedi_origen / producto.cantidad_bultos, 1)}</td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-center">
                      <button
                        onClick={() => handleABCClick(producto)}
                        className={`font-bold hover:underline cursor-pointer ${(() => {
                          if (clasificacion === 'A') return 'text-red-700 hover:text-red-900';
                          if (clasificacion === 'AB') return 'text-orange-700 hover:text-orange-900';
                          if (clasificacion === 'B') return 'text-yellow-700 hover:text-yellow-900';
                          return 'text-gray-600 hover:text-gray-800';
                        })()}`}
                        title="Click para ver cálculo de clasificación ABC"
                      >
                        {clasificacion}
                      </button>
                    </td>
                    <td className="bg-red-50 px-2 py-1 text-[10px] text-center font-bold">
                      <button
                        onClick={() => handleCriticidadClick(producto)}
                        className={`${criticidad.color} hover:underline cursor-pointer`}
                        title="Click para ver cálculo de Criticidad"
                      >
                        {criticidad.emoji}
                      </button>
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handleStockMinimoClick(producto)}
                          className="hover:underline cursor-pointer hover:text-orange-900"
                          title="Click para ver cálculo de Stock Mínimo"
                        >
                          {(calcularStockMinimo(producto) / ventaDiariaBultos).toFixed(1)}
                        </button>
                      ) : '-'}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handleStockSeguridadClick(producto)}
                          className="hover:underline cursor-pointer hover:text-blue-900"
                          title="Click para ver cálculo de Stock de Seguridad"
                        >
                          {(calcularStockSeguridad(producto) / ventaDiariaBultos).toFixed(1)}
                        </button>
                      ) : '-'}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handlePuntoReordenClick(producto)}
                          className="hover:underline cursor-pointer hover:text-orange-900"
                          title="Click para ver cálculo de Punto de Reorden"
                        >
                          {(calcularPuntoReorden(producto) / ventaDiariaBultos).toFixed(1)}
                        </button>
                      ) : '-'}
                    </td>
                    <td className="bg-orange-50 px-2 py-1 text-[11px] text-orange-800 text-center font-medium">
                      {stockParams && producto.prom_ventas_20dias_unid > 0 ? (
                        <button
                          onClick={() => handleStockMaximoClick(producto)}
                          className="hover:underline cursor-pointer hover:text-orange-900"
                          title="Click para ver cálculo de Stock Máximo"
                        >
                          {(calcularStockMaximo(producto) / ventaDiariaBultos).toFixed(1)}
                        </button>
                      ) : '-'}
                    </td>
                    <td className="bg-yellow-50 px-2 py-1 text-[11px] text-yellow-800 text-center font-medium">
                      <button
                        onClick={() => handlePedidoSugeridoClick(producto)}
                        className={`hover:underline cursor-pointer transition-colors ${calcularPedidoSugerido(producto) > 0 ? 'text-orange-700 hover:text-orange-900' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Click para ver cálculo de Cantidad Sugerida"
                      >
                        {calcularPedidoSugerido(producto)}
                      </button>
                    </td>
                    <td className="bg-yellow-50 px-2 py-1 text-center">
                      <button
                        onClick={() => handlePedidoSugeridoClick(producto)}
                        className="text-[11px] font-bold text-gray-900 hover:underline cursor-pointer hover:text-gray-700"
                        title="Click para ver cálculo de Cantidad Pedida"
                      >
                        {formatNumber(producto.cantidad_pedida_bultos, 2)}
                      </button>
                    </td>
                    <td className="bg-indigo-50 px-2 py-1 text-[11px] text-indigo-800 text-center font-medium">
                      {formatNumber((producto.cantidad_pedida_bultos || 0) * producto.cantidad_bultos * (producto.peso_unidad || 0) / 1000, 2)}
                    </td>
                    <td className="bg-yellow-50 px-2 py-1 text-[11px] text-gray-700">{producto.razon_pedido}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ← Atrás
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="px-6 py-2 border border-gray-900 rounded-md text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar Borrador'}
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar Pedido'}
          </button>
        </div>
      </div>

      {/* Modales educativos */}
      {selectedProductoSales && (
        <ProductSalesModal
          isOpen={salesModalOpen}
          onClose={() => setSalesModalOpen(false)}
          codigoProducto={selectedProductoSales.codigo_producto}
          descripcionProducto={selectedProductoSales.descripcion_producto}
          currentUbicacionId={orderData.tienda_destino}
        />
      )}

      {selectedProductoABC && (
        <ABCClassificationModal
          isOpen={abcModalOpen}
          onClose={() => setAbcModalOpen(false)}
          producto={{
            codigo_producto: selectedProductoABC.codigo_producto,
            descripcion_producto: selectedProductoABC.descripcion_producto,
            prom_ventas_20dias_unid: selectedProductoABC.prom_ventas_20dias_unid,
            cantidad_bultos: selectedProductoABC.cantidad_bultos,
          }}
        />
      )}

      {selectedProductoStockMin && (
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

      {selectedProductoStockSeg && (
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

      {selectedProductoReorden && (
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

      {selectedProductoStockMax && (
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

      {selectedProductoDias && (
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

      {selectedProductoPedido && (
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

      {selectedProductoCriticidad && (
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
    </div>
  );
}
