import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../services/http';
import type { OrderData, ProductoPedido } from './OrderWizard';
import { formatNumber } from '../../utils/formatNumber';
import ProductSalesModal from '../sales/ProductSalesModal';
import ABCClassificationModal from './ABCClassificationModal';
import StockSeguridadModal from './StockSeguridadModal';
import PuntoReordenModal from './PuntoReordenModal';
import StockMaximoModal from './StockMaximoModal';
import StockDiasModal from './StockDiasModal';
import PedidoSugeridoModal from './PedidoSugeridoModal';
import CriticidadModal from './CriticidadModal';
import * as XLSX from 'xlsx';

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

type ViewType = 'criticidad' | 'excel';

export default function OrderStepThree({ orderData, onBack }: Props) {
  const navigate = useNavigate();
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('criticidad');
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

  // Config de días de cobertura por clase ABC (para modales)
  const [configDiasCobertura, setConfigDiasCobertura] = useState<{ clase_a: number; clase_b: number; clase_c: number } | null>(null);

  // Cargar parámetros de stock al montar componente
  useEffect(() => {
    const cargarStockParams = async () => {
      try {
        const response = await http.get(`/api/ubicaciones/${orderData.tienda_destino}/stock-params`);
        setStockParams(response.data);
      } catch (error) {
        console.error('Error cargando parámetros de stock:', error);
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
        setConfigDiasCobertura({ clase_a: 7, clase_b: 14, clase_c: 30 });
      }
    };

    if (orderData.tienda_destino) {
      cargarStockParams();
      cargarConfigABC();
    }
  }, [orderData.tienda_destino]);

  // Filtrar productos incluidos Y con cantidad pedida > 0
  const productosIncluidos = orderData.productos.filter(p => {
    const cantidadPedida = p.cantidad_pedida_bultos || 0;
    const incluido = p.incluido !== false;
    const tienePedido = cantidadPedida > 0;
    return incluido && tienePedido;
  });

  // Función para clasificación ABC (usar del backend si disponible)
  const getClasificacionABC = (producto: ProductoPedido): string => {
    if (producto.clasificacion_abc) return producto.clasificacion_abc;
    const ventaDiariaBultos = producto.prom_ventas_20dias_unid / producto.cantidad_bultos;
    if (ventaDiariaBultos >= 20) return 'A';
    if (ventaDiariaBultos >= 5) return 'AB';
    if (ventaDiariaBultos >= 0.45) return 'B';
    if (ventaDiariaBultos >= 0.20) return 'BC';
    if (ventaDiariaBultos >= 0.001) return 'C';
    return '-';
  };

  // Helpers para días de stock (usando valores del backend)
  const getDiasStockActual = (producto: ProductoPedido): number => {
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return 999;
    const stockTotalUnidades = producto.stock_tienda + producto.stock_en_transito;
    return stockTotalUnidades / velocidadP75;
  };

  const getDiasSeguridad = (producto: ProductoPedido): number => {
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return 0;
    return (producto.stock_seguridad || 0) / velocidadP75;
  };

  const getDiasMinimo = (producto: ProductoPedido): number => {
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return 0;
    const puntoReorden = producto.punto_reorden || producto.stock_minimo || 0;
    return puntoReorden / velocidadP75;
  };

  const getDiasMaximo = (producto: ProductoPedido): number => {
    const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
    if (velocidadP75 <= 0) return 0;
    return (producto.stock_maximo || 0) / velocidadP75;
  };

  // Helpers para bultos
  const getStockSeguridadBultos = (producto: ProductoPedido): number => {
    return (producto.stock_seguridad || 0) / producto.cantidad_bultos;
  };

  const getPuntoReordenBultos = (producto: ProductoPedido): number => {
    const puntoReorden = producto.punto_reorden || producto.stock_minimo || 0;
    return puntoReorden / producto.cantidad_bultos;
  };

  const getStockMaximoBultos = (producto: ProductoPedido): number => {
    return (producto.stock_maximo || 0) / producto.cantidad_bultos;
  };

  // Función para calcular criticidad numérica (4 niveles basados en SS, ROP, MAX)
  const calcularCriticidad = (producto: ProductoPedido): number => {
    if (producto.prom_ventas_20dias_unid <= 0) return 999;

    const clasificacion = getClasificacionABC(producto);
    const diasStockActual = getDiasStockActual(producto);
    const diasSS = getDiasSeguridad(producto);
    const diasROP = getDiasMinimo(producto);
    const diasMAX = getDiasMaximo(producto);

    // Peso ABC
    const pesoABC = { 'A': 1, 'AB': 2, 'B': 3, 'BC': 4, 'C': 5, '-': 6 }[clasificacion] || 6;

    // Determinar nivel de urgencia
    let urgenciaStock = 0;
    if (diasStockActual <= diasSS) {
      urgenciaStock = 1; // CRÍTICO
    } else if (diasStockActual <= diasROP) {
      urgenciaStock = 2; // URGENTE
    } else if (diasStockActual <= diasMAX) {
      urgenciaStock = 3; // ÓPTIMO
    } else {
      urgenciaStock = 4; // EXCESO
    }

    return (urgenciaStock * 10) + pesoABC;
  };

  // Función para obtener display de criticidad
  const getCriticidadDisplay = (producto: ProductoPedido) => {
    if (producto.prom_ventas_20dias_unid <= 0) {
      return { emoji: '-', color: 'text-gray-400', nivel: '-' };
    }

    const clasificacion = getClasificacionABC(producto);
    const diasStockActual = getDiasStockActual(producto);
    const diasSS = getDiasSeguridad(producto);
    const diasROP = getDiasMinimo(producto);
    const diasMAX = getDiasMaximo(producto);

    let emoji = '';
    let color = '';
    let nivel = '';

    if (diasStockActual <= diasSS) {
      emoji = clasificacion === 'A' ? '🔴🔴' : '🔴';
      color = 'text-red-700';
      nivel = 'CRÍTICO';
    } else if (diasStockActual <= diasROP) {
      emoji = clasificacion === 'A' ? '🟠🟠' : '🟠';
      color = 'text-orange-600';
      nivel = 'URGENTE';
    } else if (diasStockActual <= diasMAX) {
      emoji = '✓';
      color = 'text-green-600';
      nivel = 'ÓPTIMO';
    } else {
      emoji = '⚠️';
      color = 'text-blue-600';
      nivel = 'EXCESO';
    }

    return { emoji, color, nivel };
  };

  // Ordenar por criticidad (menor = más crítico primero)
  const productosOrdenados = useMemo(() => {
    return [...productosIncluidos].sort((a, b) => {
      const criticidadA = calcularCriticidad(a);
      const criticidadB = calcularCriticidad(b);
      return criticidadA - criticidadB;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productosIncluidos]);

  const totalBultos = productosOrdenados.reduce((sum, p) => sum + (p.cantidad_pedida_bultos || 0), 0);

  // Total de ventas para calcular % de participación (estimado mensual)
  const totalVentasGeneral = useMemo(() => {
    return productosOrdenados.reduce((sum, p) => sum + (p.prom_ventas_20dias_unid * 30), 0);
  }, [productosOrdenados]);

  // Ranking de productos por venta (para calcular Top50, Top100, Top150)
  const rankingVentas = useMemo(() => {
    const productosConVenta = [...productosOrdenados]
      .map(p => ({ codigo: p.codigo_producto, venta: p.prom_ventas_20dias_unid * 30 }))
      .sort((a, b) => b.venta - a.venta);

    const ranking: { [codigo: string]: number } = {};
    productosConVenta.forEach((p, idx) => {
      ranking[p.codigo] = idx + 1; // Ranking 1-based
    });
    return ranking;
  }, [productosOrdenados]);

  // Handlers para modales
  const handleSalesClick = (producto: ProductoPedido) => {
    setSelectedProductoSales(producto);
    setSalesModalOpen(true);
  };

  const handleABCClick = (producto: ProductoPedido) => {
    setSelectedProductoABC(producto);
    setAbcModalOpen(true);
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

  // Exportar a Excel
  const handleExportExcel = () => {
    const data = productosOrdenados.map((p, index) => {
      const criticidad = calcularCriticidad(p);
      const criticidadDisplay = getCriticidadDisplay(p);
      return {
        '#': index + 1,
        'Código': p.codigo_producto,
        'Cód. Barras': p.codigo_barras || '',
        'Descripción': p.descripcion_producto,
        'Und/Bulto': p.cantidad_bultos,
        'Unidad Pedido': p.unidad_pedido || 'Bulto',
        'Criticidad': criticidad,
        'Nivel': criticidadDisplay.nivel,
        'P75 (b/día)': formatNumber((p.prom_p75_unid || 0) / p.cantidad_bultos, 2),
        'ABC': getClasificacionABC(p),
        'Stock (b)': formatNumber((p.stock_tienda + p.stock_en_transito) / p.cantidad_bultos, 2),
        'Días Stock': formatNumber(getDiasStockActual(p), 1),
        'Stock CEDI (b)': formatNumber(p.stock_cedi_origen / p.cantidad_bultos, 2),
        'SS (días)': formatNumber(getDiasSeguridad(p), 1),
        'SS (bultos)': formatNumber(getStockSeguridadBultos(p), 1),
        'ROP (días)': formatNumber(getDiasMinimo(p), 1),
        'ROP (bultos)': formatNumber(getPuntoReordenBultos(p), 1),
        'MAX (días)': formatNumber(getDiasMaximo(p), 1),
        'MAX (bultos)': formatNumber(getStockMaximoBultos(p), 1),
        'Pedir (bultos)': p.cantidad_pedida_bultos || 0,
        'Pedir (unidades)': (p.cantidad_pedida_bultos || 0) * p.cantidad_bultos,
        'Peso Total (kg)': formatNumber((p.cantidad_pedida_bultos || 0) * p.cantidad_bultos * (p.peso_unidad || 0) / 1000, 2),
        'Notas': p.razon_pedido || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

    // Ajustar anchos de columna
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 12 },  // Código
      { wch: 15 },  // Cód. Barras
      { wch: 40 },  // Descripción
      { wch: 10 },  // Und/Bulto
      { wch: 12 },  // Unidad Pedido
      { wch: 10 },  // Criticidad
      { wch: 10 },  // Nivel
      { wch: 10 },  // P75 (b/día)
      { wch: 6 },   // ABC
      { wch: 12 },  // Stock (b)
      { wch: 12 },  // Días Stock
      { wch: 12 },  // Stock CEDI
      { wch: 10 },  // SS (días)
      { wch: 12 },  // SS (bultos)
      { wch: 10 },  // ROP (días)
      { wch: 12 },  // ROP (bultos)
      { wch: 10 },  // MAX (días)
      { wch: 12 },  // MAX (bultos)
      { wch: 14 },  // Pedir (bultos)
      { wch: 14 },  // Pedir (unidades)
      { wch: 14 },  // Peso Total
      { wch: 30 }   // Notas
    ];

    const fecha = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Pedido_${orderData.tienda_destino_nombre}_${fecha}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  };

  const handleSubmit = async (enviar: boolean = false) => {
    setLoading(true);
    try {
      const payload = {
        cedi_origen_id: orderData.cedi_origen,
        cedi_origen_nombre: orderData.cedi_origen_nombre,
        tienda_destino_id: orderData.tienda_destino,
        tienda_destino_nombre: orderData.tienda_destino_nombre,
        dias_cobertura: 3,
        productos: orderData.productos,
        devoluciones: [],
        observaciones: observaciones,
        requiere_aprobacion: enviar
      };

      const response = await http.post('/api/pedidos-sugeridos/', payload);

      const mensaje = enviar
        ? `Pedido ${response.data.numero_pedido} enviado para aprobacion del gerente!`
        : `Pedido ${response.data.numero_pedido} guardado como borrador!`;

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Confirmacion de Pedido</h2>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar Excel
          </button>
        </div>

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
            <div className="text-xs text-blue-600 mb-1">Productos a Pedir</div>
            <div className="text-2xl font-bold text-blue-900">{productosOrdenados.length}</div>
          </div>
          <div className="bg-green-50 rounded-md p-4">
            <div className="text-xs text-green-600 mb-1">Total Bultos</div>
            <div className="text-2xl font-bold text-green-900">{formatNumber(totalBultos, 0)}</div>
          </div>
          <div className="bg-purple-50 rounded-md p-4">
            <div className="text-xs text-purple-600 mb-1">Total Productos Analizados</div>
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

      {/* Tabs de vistas */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveView('criticidad')}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeView === 'criticidad'
                  ? 'bg-white text-gray-900 border border-b-0 border-gray-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Vista Criticidad
            </button>
            <button
              onClick={() => setActiveView('excel')}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeView === 'excel'
                  ? 'bg-white text-gray-900 border border-b-0 border-gray-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Vista Planificacion
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {activeView === 'criticidad'
              ? <>Productos ordenados por <span className="font-semibold text-orange-600">criticidad</span> (mas urgentes primero)</>
              : <>Vista de <span className="font-semibold text-blue-600">planificacion</span> estilo hoja de calculo</>
            }
          </p>
        </div>

        {/* Vista Criticidad */}
        {activeView === 'criticidad' && (
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-xs" style={{ minWidth: '1200px' }}>
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Codigo</th>
                <th className="bg-gray-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '110px' }}>Cod. Barras</th>
                <th className="bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 text-xs uppercase" style={{ minWidth: '200px' }}>Descripcion</th>
                <th className="bg-orange-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '50px' }}>Crit.</th>
                <th className="bg-blue-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '55px' }}>P75</th>
                <th className="bg-orange-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '45px' }}>ABC</th>
                <th className="bg-green-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '60px' }}>Stock</th>
                <th className="bg-green-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '55px' }}>Dias</th>
                <th className="bg-green-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '60px' }}>CEDI</th>
                <th className="bg-orange-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '60px' }}>SS</th>
                <th className="bg-orange-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '60px' }}>ROP</th>
                <th className="bg-orange-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '60px' }}>MAX</th>
                <th className="bg-yellow-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '65px' }}>Pedir</th>
                <th className="bg-indigo-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '65px' }}>Peso Kg</th>
                <th className="bg-gray-50 px-2 py-2 text-left font-semibold text-gray-700 text-xs uppercase" style={{ minWidth: '120px' }}>Notas</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productosOrdenados.map((producto, index) => {
                const clasificacion = getClasificacionABC(producto);
                const criticidadNum = calcularCriticidad(producto);
                const criticidadDisplay = getCriticidadDisplay(producto);

                return (
                  <tr key={`${producto.codigo_producto}-${index}`} className="hover:bg-gray-50">
                    {/* Código */}
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-xs font-medium text-gray-900">
                      {producto.codigo_producto}
                    </td>
                    {/* Código de Barras */}
                    <td className="px-2 py-1.5 text-xs text-gray-600 text-center font-mono">
                      {producto.codigo_barras || '-'}
                    </td>
                    {/* Descripción */}
                    <td className="px-2 py-1.5 text-xs text-gray-900">
                      <button
                        onClick={() => handleSalesClick(producto)}
                        className="hover:underline cursor-pointer hover:text-blue-700 text-left"
                        title="Ver ventas del producto"
                      >
                        {producto.descripcion_producto}
                      </button>
                    </td>
                    {/* Criticidad */}
                    <td className="bg-orange-50 px-2 py-1.5 text-center">
                      <button
                        onClick={() => handleCriticidadClick(producto)}
                        className={`${criticidadDisplay.color} hover:underline cursor-pointer font-bold text-sm`}
                        title={`${criticidadDisplay.nivel} (${criticidadNum})\nStock: ${getDiasStockActual(producto).toFixed(1)}d | SS: ${getDiasSeguridad(producto).toFixed(1)}d | ROP: ${getDiasMinimo(producto).toFixed(1)}d | MAX: ${getDiasMaximo(producto).toFixed(1)}d`}
                      >
                        {criticidadDisplay.emoji}
                      </button>
                    </td>
                    {/* P75 (Velocidad) */}
                    <td className="bg-blue-50 px-2 py-1.5 text-xs text-blue-800 text-center font-medium">
                      {formatNumber((producto.prom_p75_unid || 0) / producto.cantidad_bultos, 2)}
                    </td>
                    {/* ABC */}
                    <td className="bg-orange-50 px-2 py-1.5 text-xs text-center">
                      <button
                        onClick={() => handleABCClick(producto)}
                        className={`font-bold hover:underline cursor-pointer ${
                          clasificacion === 'A' ? 'text-red-700' :
                          clasificacion === 'B' ? 'text-yellow-700' : 'text-gray-600'
                        }`}
                        title="Ver clasificacion ABC"
                      >
                        {clasificacion}
                      </button>
                    </td>
                    {/* Stock */}
                    <td className="bg-green-50 px-2 py-1.5 text-xs text-green-800 text-center">
                      {formatNumber((producto.stock_tienda + producto.stock_en_transito) / producto.cantidad_bultos, 1)}
                    </td>
                    {/* Días */}
                    <td className="bg-green-50 px-2 py-1.5 text-xs text-center font-bold">
                      <button
                        onClick={() => handleStockDiasClick(producto)}
                        className="hover:underline cursor-pointer hover:text-indigo-900"
                        title="Ver analisis de urgencia"
                      >
                        {producto.prom_ventas_20dias_unid > 0 ? getDiasStockActual(producto).toFixed(1) : '---'}
                      </button>
                    </td>
                    {/* CEDI */}
                    <td className="bg-green-50 px-2 py-1.5 text-xs text-green-800 text-center">
                      {formatNumber(producto.stock_cedi_origen / producto.cantidad_bultos, 1)}
                    </td>
                    {/* SS */}
                    <td className="bg-orange-50 px-2 py-1.5 text-xs text-orange-800 text-center">
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockSeguridadClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer"
                          title={`SS: ${(producto.stock_seguridad || 0).toFixed(0)} und | ${getStockSeguridadBultos(producto).toFixed(1)} bultos`}
                        >
                          <span className="font-medium block">{getDiasSeguridad(producto).toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500 block">{getStockSeguridadBultos(producto).toFixed(1)}b</span>
                        </button>
                      ) : '-'}
                    </td>
                    {/* ROP */}
                    <td className="bg-orange-50 px-2 py-1.5 text-xs text-orange-800 text-center">
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handlePuntoReordenClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer"
                          title={`ROP: ${(producto.stock_minimo || 0).toFixed(0)} und | ${getPuntoReordenBultos(producto).toFixed(1)} bultos`}
                        >
                          <span className="font-medium block">{getDiasMinimo(producto).toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500 block">{getPuntoReordenBultos(producto).toFixed(1)}b</span>
                        </button>
                      ) : '-'}
                    </td>
                    {/* MAX */}
                    <td className="bg-orange-50 px-2 py-1.5 text-xs text-orange-800 text-center">
                      {producto.prom_p75_unid > 0 ? (
                        <button
                          onClick={() => handleStockMaximoClick(producto)}
                          className="hover:underline hover:text-orange-900 cursor-pointer"
                          title={`Max: ${(producto.stock_maximo || 0).toFixed(0)} und | ${getStockMaximoBultos(producto).toFixed(1)} bultos`}
                        >
                          <span className="font-medium block">{getDiasMaximo(producto).toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500 block">{getStockMaximoBultos(producto).toFixed(1)}b</span>
                        </button>
                      ) : '-'}
                    </td>
                    {/* Pedir */}
                    <td className="bg-yellow-100 px-2 py-1.5 text-center">
                      <button
                        onClick={() => handlePedidoSugeridoClick(producto)}
                        className="text-sm font-bold text-gray-900 hover:underline cursor-pointer hover:text-gray-700"
                        title="Ver calculo de pedido sugerido"
                      >
                        {formatNumber(producto.cantidad_pedida_bultos || 0, 0)}
                      </button>
                    </td>
                    {/* Peso */}
                    <td className="bg-indigo-50 px-2 py-1.5 text-xs text-indigo-800 text-center">
                      {formatNumber((producto.cantidad_pedida_bultos || 0) * producto.cantidad_bultos * (producto.peso_unidad || 0) / 1000, 1)}
                    </td>
                    {/* Notas */}
                    <td className="bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
                      {producto.razon_pedido || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Vista Excel/Planificacion */}
        {activeView === 'excel' && (
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-xs" style={{ minWidth: '1400px' }}>
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Codigo</th>
                <th className="bg-gray-100 px-2 py-2 text-left font-semibold text-gray-700 text-xs uppercase" style={{ minWidth: '200px' }}>Descripcion</th>
                <th className="bg-gray-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '50px' }}>UM</th>
                <th className="bg-blue-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Vta Total</th>
                <th className="bg-blue-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '60px' }}>% Vta</th>
                <th className="bg-yellow-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '50px' }}>TOP</th>
                <th className="bg-green-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '70px' }}>Dias Inv</th>
                <th className="bg-green-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Prom Vta</th>
                <th className="bg-orange-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '90px' }}>Tot Almacenar</th>
                <th className="bg-purple-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Exist. Teor</th>
                <th className="bg-purple-50 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Req. Teor</th>
                <th className="bg-gray-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Bulto/Emp</th>
                <th className="bg-gray-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '70px' }}>Ctd x Bulto</th>
                <th className="bg-yellow-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '80px' }}>Escenario</th>
                <th className="bg-yellow-100 px-2 py-2 text-center font-semibold text-gray-700 text-xs uppercase" style={{ width: '70px' }}>Pedir</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productosOrdenados.map((producto, index) => {
                // Calculos para vista Excel
                const ventaTotal = producto.prom_ventas_20dias_unid * 30; // Estimado mensual
                const velocidadP75 = producto.prom_p75_unid || producto.prom_ventas_20dias_unid;
                const diasInventario = getDiasStockActual(producto);
                const totalAlmacenar = producto.stock_maximo || 0; // Stock maximo como objetivo
                const existenciaTeorica = producto.stock_tienda + producto.stock_en_transito;
                const requerimientoTeorico = Math.max(0, totalAlmacenar - existenciaTeorica);
                const bultosRequeridos = Math.ceil(requerimientoTeorico / producto.cantidad_bultos);

                // Calcular ranking TOP basado en posición de venta
                const rankingProducto = rankingVentas[producto.codigo_producto] || 999;

                // Calcular % de venta sobre el total general
                const porcentajeVenta = totalVentasGeneral > 0 ? (ventaTotal / totalVentasGeneral) * 100 : 0;

                return (
                  <tr key={`excel-${producto.codigo_producto}-${index}`} className="hover:bg-gray-50">
                    {/* Código */}
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-xs font-medium text-gray-900">
                      {producto.codigo_producto}
                    </td>
                    {/* Descripción */}
                    <td className="px-2 py-1.5 text-xs text-gray-900">
                      <button
                        onClick={() => handleSalesClick(producto)}
                        className="hover:underline cursor-pointer hover:text-blue-700 text-left"
                        title="Ver ventas del producto"
                      >
                        {producto.descripcion_producto}
                      </button>
                    </td>
                    {/* UM */}
                    <td className="px-2 py-1.5 text-xs text-gray-600 text-center">
                      {producto.unidad_medida || 'UND'}
                    </td>
                    {/* Venta Total */}
                    <td className="bg-blue-50 px-2 py-1.5 text-xs text-blue-800 text-center">
                      {formatNumber(ventaTotal, 0)}
                    </td>
                    {/* % Venta */}
                    <td className="bg-blue-50 px-2 py-1.5 text-xs text-blue-800 text-center">
                      {formatNumber(porcentajeVenta, 2)}%
                    </td>
                    {/* TOP */}
                    <td className="bg-yellow-50 px-2 py-1.5 text-xs text-center">
                      {rankingProducto <= 50 ? (
                        <span className="text-red-600 font-bold">Top50</span>
                      ) : rankingProducto <= 100 ? (
                        <span className="text-orange-600 font-bold">Top100</span>
                      ) : rankingProducto <= 150 ? (
                        <span className="text-yellow-700 font-bold">Top150</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {/* Dias Inventario */}
                    <td className="bg-green-50 px-2 py-1.5 text-xs text-green-800 text-center font-medium">
                      {velocidadP75 > 0 ? formatNumber(diasInventario, 1) : '---'}
                    </td>
                    {/* Prom Venta (diaria) */}
                    <td className="bg-green-50 px-2 py-1.5 text-xs text-green-800 text-center">
                      {formatNumber(velocidadP75, 1)}
                    </td>
                    {/* Total a Almacenar (Stock Maximo) */}
                    <td className="bg-orange-50 px-2 py-1.5 text-xs text-orange-800 text-center">
                      {formatNumber(totalAlmacenar, 0)}
                    </td>
                    {/* Existencia Teorica */}
                    <td className="bg-purple-50 px-2 py-1.5 text-xs text-purple-800 text-center">
                      {formatNumber(existenciaTeorica, 0)}
                    </td>
                    {/* Requerimiento Teorico */}
                    <td className="bg-purple-50 px-2 py-1.5 text-xs text-purple-800 text-center font-medium">
                      {formatNumber(requerimientoTeorico, 0)}
                    </td>
                    {/* Bulto/Empaque */}
                    <td className="px-2 py-1.5 text-xs text-gray-700 text-center">
                      BULTO
                    </td>
                    {/* Cantidad x Bulto */}
                    <td className="px-2 py-1.5 text-xs text-gray-700 text-center">
                      {formatNumber(producto.cantidad_bultos, 0)}
                    </td>
                    {/* Escenario Requerido (bultos teoricos) */}
                    <td className="bg-yellow-100 px-2 py-1.5 text-xs text-yellow-800 text-center">
                      {formatNumber(bultosRequeridos, 0)}
                    </td>
                    {/* Pedir (bultos finales) */}
                    <td className="bg-yellow-100 px-2 py-1.5 text-center">
                      <button
                        onClick={() => handlePedidoSugeridoClick(producto)}
                        className="text-sm font-bold text-gray-900 hover:underline cursor-pointer hover:text-gray-700"
                        title="Ver calculo de pedido sugerido"
                      >
                        {formatNumber(producto.cantidad_pedida_bultos || 0, 0)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Atras
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

      {selectedProductoCriticidad && (
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
    </div>
  );
}
