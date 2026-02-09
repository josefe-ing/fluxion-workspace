import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Fluxion AI',
  tagline: 'Inteligencia proactiva para gestión de inventario',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // URL de producción
  url: 'https://docs.fluxionia.co',
  baseUrl: '/',

  organizationName: 'fluxion-ai',
  projectName: 'fluxion-docs',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Docs en la raíz (no /docs)
          editUrl: 'https://github.com/fluxion-ai/fluxion-docs/edit/main/',
        },
        blog: false, // Deshabilitado por ahora
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/fluxion-social-card.png',
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Fluxion AI',
      logo: {
        alt: 'Fluxion AI Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentación',
        },
        {
          href: 'https://granja.fluxionia.co',
          label: 'Ir a la App',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentación',
          items: [
            {
              label: 'Introducción',
              to: '/',
            },
            {
              label: 'Guía de Inicio',
              to: '/getting-started/quick-start',
            },
          ],
        },
        {
          title: 'Módulos',
          items: [
            {
              label: 'Ventas',
              to: '/modulos/ventas',
            },
            {
              label: 'Inventario',
              to: '/modulos/inventario',
            },
            {
              label: 'Pedidos Sugeridos',
              to: '/modulos/pedidos-sugeridos',
            },
          ],
        },
        {
          title: 'Más',
          items: [
            {
              label: 'Fluxion AI',
              href: 'https://fluxionia.co',
            },
            {
              label: 'Contacto',
              href: 'mailto:soporte@fluxionia.co',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Fluxion AI. Todos los derechos reservados.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
