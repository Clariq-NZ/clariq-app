/** Clariq design tokens - Architecture section 14.
 * Every colour is a CSS variable set in styles/index.css, with light and dark
 * values, so no component ever hard-codes a surface or text colour. Functional
 * status colours are Okabe-Ito and are always paired with icon + label.
 * Accent: Clariq Gold, used for emphasis and selected states, never body text.
 * Brand source: Clariq Brand Guidelines v1.1. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper:   'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft:    'rgb(var(--ink-soft) / <alpha-value>)',
          faint:   'rgb(var(--ink-faint) / <alpha-value>)',
        },
        line:    'rgb(var(--line) / <alpha-value>)',
        bar: {
          DEFAULT: 'rgb(var(--bar) / <alpha-value>)',
          ink:     'rgb(var(--bar-ink) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          ink:     'rgb(var(--accent-ink) / <alpha-value>)',
        },
        status: {
          ready: '#009E73',      // IN_STOCK, FILLED
          out: '#0072B2',        // WITH_CUSTOMER, RETURN_REQUESTED, IN_TRANSIT
          processing: '#E69F00', // AWAITING_WASH, AWAITING_INSPECTION
          overdue: '#D55E00',    // calculated flag
          problem: '#CC79A7',    // QUARANTINED, LOST
          eol: '#7A7A7A',        // RETIRED, SENT_FOR_RECYCLING, RECYCLED, VOID
          neutral: '#56B4E9',    // NEW
        },
      },
      fontFamily: {
        display: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: { brand: '0.28em' },
      borderRadius: { DEFAULT: '4px' },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -16px rgb(0 0 0 / 0.25)' },
    },
  },
  darkMode: 'media',
}
