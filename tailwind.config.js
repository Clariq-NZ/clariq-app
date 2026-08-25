/** Clariq design tokens — Architecture section 14.
 * Brand: charcoal ink on off-white paper (from logo). Functional colours are
 * the ONLY colour in the UI: Okabe–Ito, always paired with icon + label.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F5F2',
        ink: { DEFAULT: '#21252A', soft: '#4A5057', faint: '#8A9098' },
        line: '#DDDBD5',
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
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: { brand: '0.28em' },
    },
  },
  darkMode: 'media',
  plugins: [],
}
