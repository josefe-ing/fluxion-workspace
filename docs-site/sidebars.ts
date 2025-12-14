import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Guía de Inicio',
      collapsed: false,
      items: [
        'getting-started/quick-start',
        'getting-started/conceptos-clave',
        'getting-started/navegacion',
      ],
    },
    {
      type: 'category',
      label: 'Módulos',
      collapsed: false,
      items: [
        {
          type: 'category',
          label: 'Ventas',
          items: [
            'modulos/ventas/index',
            'modulos/ventas/dashboard',
            'modulos/ventas/reportes',
            'modulos/ventas/centro-comando',
            'modulos/ventas/ventas-perdidas',
          ],
        },
        {
          type: 'category',
          label: 'Inventario',
          items: [
            'modulos/inventario/index',
            'modulos/inventario/stock-actual',
            'modulos/inventario/alertas',
            'modulos/inventario/agotados',
          ],
        },
        {
          type: 'category',
          label: 'Productos',
          items: [
            'modulos/productos/index',
            'modulos/productos/analisis-maestro',
            'modulos/productos/clasificacion-abc',
            'modulos/productos/matriz-abc-xyz',
          ],
        },
        {
          type: 'category',
          label: 'Pedidos CEDI→Tienda',
          items: [
            'modulos/pedidos-sugeridos/index',
            'modulos/pedidos-sugeridos/crear-pedido',
            'modulos/pedidos-sugeridos/punto-reorden',
            'modulos/pedidos-sugeridos/aprobacion',
          ],
        },
        {
          type: 'category',
          label: 'Pedidos Inter-CEDI',
          items: [
            'modulos/pedidos-inter-cedi/index',
            'modulos/pedidos-inter-cedi/crear-pedido',
            'modulos/pedidos-inter-cedi/formulas',
            'modulos/pedidos-inter-cedi/columnas',
          ],
        },
        {
          type: 'category',
          label: 'Emergencias',
          items: [
            'modulos/emergencias/index',
            'modulos/emergencias/dashboard',
            'modulos/emergencias/configuracion',
            'modulos/emergencias/formulas',
          ],
        },
        {
          type: 'category',
          label: 'Administrador',
          items: [
            'modulos/administrador/index',
            'modulos/administrador/etl-control',
            'modulos/administrador/parametros-abc',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Conceptos',
      items: [
        'conceptos/clasificacion-abc',
        'conceptos/analisis-xyz',
        'conceptos/punto-reorden',
        'conceptos/stock-seguridad',
      ],
    },
  ],
};

export default sidebars;
