/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'SF Pro Text',
          'PingFang SC',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif'
        ],
        heading: [
          'SF Pro',
          'PingFang SC',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif'
        ],
        metric: [
          'Inter',
          'SF Pro Text',
          'PingFang SC',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif'
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SF Mono',
          'Menlo',
          'Consolas',
          'monospace'
        ]
      },
      colors: {
        // Brand — full numeric scale（代码中 brand-500/600/700 等数字色阶依赖此定义）
        brand: {
          50:  '#F1EFFF',
          100: '#E2DBFF',
          200: '#C5B8FF',
          300: '#A896FF',
          400: '#8B73FF',
          500: '#6A6FFF',   // hover
          600: '#4B3FE3',   // 主色 DEFAULT
          700: '#3F31C6',   // active
          800: '#322A9D',
          900: '#262275',
          DEFAULT: '#4B3FE3',
          hover:   '#6A6FFF',
          active:  '#3F31C6',
          disabled: 'rgba(75,63,227,0.22)',
          popup:   'rgba(170,183,255,0.36)'
        },

        // Backgrounds
        bg: {
          'base-default':  '#FFFFFF',
          'base-secondary': '#F5F5F5',
          'base-tertiary': '#E5E5E5',
          'overlay-l1':    'rgba(115,115,115,0.08)',
          'overlay-l2':    'rgba(115,115,115,0.12)',
          'overlay-l3':    'rgba(115,115,115,0.16)',
          'overlay-l4':    'rgba(115,115,115,0.20)',
          'invert':        '#262626',
          'invert-hover':  '#404040',
          'invert-active': '#171717'
        },

        // Text
        text: {
          DEFAULT:   '#171717',
          secondary: '#404040',
          tertiary:  '#737373',
          disabled:  '#A1A1A1',
          'on-brand': '#FFFFFF'
        },

        // Icons
        icon: {
          DEFAULT:   '#262626',
          secondary: '#404040',
          tertiary:  '#737373',
          disabled:  '#A1A1A1'
        },

        // Borders
        border: {
          'neutral-l1': 'rgba(115,115,115,0.12)',
          'neutral-l2': 'rgba(115,115,115,0.18)',
          'neutral-l3': 'rgba(115,115,115,0.36)',
          contrast:     '#000000',
          brand:        '#4B3FE3'
        },

        // Status — 带数字色阶，覆盖 bg-success/60、text-error 等用法
        success: {
          DEFAULT:    '#15A877',
          50:  '#E8F8F2',
          100: '#C9EEE0',
          500: '#15A877',
          600: '#128B64',
          'surface-l1': 'rgba(64,176,139,0.12)'
        },
        warning: {
          DEFAULT:    '#E27900',
          50:  '#FDF1E1',
          100: '#FAE0BC',
          500: '#E27900',
          600: '#BB6500',
          'surface-l1': 'rgba(226,121,0,0.12)'
        },
        error: {
          DEFAULT:    '#E8463A',
          50:  '#FDECEA',
          100: '#FAD2CE',
          500: '#E8463A',
          600: '#C9352B',
          'surface-l1': 'rgba(232,70,58,0.12)'
        },
        alert: {
          DEFAULT:    '#FEA900',
          'surface-l1': 'rgba(254,169,0,0.14)'
        },
        info: {
          DEFAULT:    '#2F74FF',
          'surface-l1': 'rgba(47,116,255,0.12)'
        },

        // Brand grey scale
        grey: {
          50:  '#FAFAFA',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A1A1A1',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0A0A0A'
        }
      },
      fontSize: {
        // Body sizes
        'body-xs':  ['10px', { lineHeight: '14px' }],
        'body-sm':  ['11px', { lineHeight: '16px' }],
        'body-md':  ['12px', { lineHeight: '18px' }],
        'body-base': ['14px', { lineHeight: '20px' }],
        'body-lg':  ['18px', { lineHeight: '26px' }],

        // Heading sizes
        'heading-3xs': ['11px', { lineHeight: '16px' }],
        'heading-2xs': ['12px', { lineHeight: '18px' }],
        'heading-xs':  ['13px', { lineHeight: '18px' }],
        'heading-sm':  ['16px', { lineHeight: '22px' }],
        'heading-md':  ['20px', { lineHeight: '28px' }],
        'heading-lg':  ['22px', { lineHeight: '30px' }],
        'heading-xl':  ['24px', { lineHeight: '32px' }],
        'heading-2xl': ['28px', { lineHeight: '36px' }],
        'heading-3xl': ['32px', { lineHeight: '40px' }],
        'heading-display': ['52px', { lineHeight: '60px' }]
      },
      fontWeight: {
        DEFAULT: '400',
        code:    '450',
        medium:  '500',
        strong:  '600'
      },
      letterSpacing: {
        'body-base':      '-0.02em',
        'heading-display': '-0.03em'
      },
      borderRadius: {
        0:     '0px',
        1:     '2px',
        2:     '4px',
        3:     '6px',
        4:     '8px',
        5:     '10px',
        6:     '12px',
        7:     '16px',
        8:     '20px',
        9:     '24px',
        10:    '32px',
        full:  '999px'
      },
      spacing: {
        0:  '0px',
        px: '1px',
        0.5: '2px',
        1:  '3px',
        1.5: '4px',
        2:  '6px',
        2.5: '8px',
        3:  '10px',
        4:  '12px',
        5:  '16px',
        6:  '20px',
        7:  '24px',
        8:  '32px',
        9:  '40px',
        10: '48px',
        11: '64px'
      },
      width: {
        'icon-xs':  '12px',
        'icon-sm':  '14px',
        'icon-md':  '16px',
        'icon-lg':  '20px',
        'icon-xl':  '24px'
      },
      height: {
        'icon-xs':  '12px',
        'icon-sm':  '14px',
        'icon-md':  '16px',
        'icon-lg':  '20px',
        'icon-xl':  '24px'
      },
      boxShadow: {
        soft:   '0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.06)',
        ring:   '0 0 0 1px rgba(75,63,227,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        glow:   '0 0 0 1px rgba(75,63,227,0.35), 0 8px 30px -8px rgba(75,63,227,0.3)',
        menu:   '0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        dialog: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)'
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%':      { transform: 'scale(1.25)', opacity: '1' }
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' }
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' }
        },
        typing: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%':           { transform: 'translateY(-4px)', opacity: '1' }
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' }
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' }
        }
      },
      animation: {
        pulseDot:      'pulseDot 1.4s ease-in-out infinite',
        slideUp:       'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        fadeIn:        'fadeIn 0.3s ease-out',
        typing:        'typing 1.2s ease-in-out infinite',
        shimmer:       'shimmer 2.4s linear infinite',
        float:         'float 6s ease-in-out infinite',
        gradientShift: 'gradientShift 8s ease infinite'
      }
    }
  },
  plugins: []
}
