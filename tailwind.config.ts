import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      gridTemplateColumns: {
        "13": "repeat(13, minmax(0, 1fr))",
        "14": "repeat(14, minmax(0, 1fr))",
        "15": "repeat(15, minmax(0, 1fr))",
        "16": "repeat(16, minmax(0, 1fr))",
        "17": "repeat(17, minmax(0, 1fr))",
        "18": "repeat(18, minmax(0, 1fr))",
        "19": "repeat(19, minmax(0, 1fr))",
        "20": "repeat(20, minmax(0, 1fr))",
        "33": "repeat(33, minmax(0, 1fr))",
      },
      gridColumn: {
        "span-13": "span 13 / span 13",
        "span-14": "span 14 / span 14",
        "span-15": "span 15 / span 15",
        "span-16": "span 16 / span 16",
        "span-17": "span 17 / span 17",
        "span-18": "span 18 / span 18",
        "span-19": "span 19 / span 19",
        "span-20": "span 20 / span 20",
      },
      screens: {
        "2xs": "365px",
        xs: "425px",
        "2xl": "1400px",
      },
      fontSize: {
        "5xs": ["0.25rem", "0.375rem"],
        "4xs": ["0.375rem", "0.5rem"],
        "3xs": ["0.5rem", "0.625rem"],
        "2xs": ["0.625rem", "0.75rem"],
      },
      fontFamily: {
        varela: ["Varela Round", "sans-serif"],
        yellowtail: ["Yellowtail", "cursive"],
        oswald: ["Oswald", "sans-serif"],
      },
      boxShadow: {
        inv: "0 1px 10px #161616",
        default: "0 3px 10px #787878",
        btn: "inset 0.2rem -0.6rem 0.2rem -0.15rem #a1a1a15a",
        emboss:
          "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 2px rgba(0,0,0,0.3), 0 0 4px 1px rgba(0,0,0,0.2), inset 0 3px 2px rgba(255,255,255,.22), inset 0 -3px 2px rgba(0,0,0,.15), inset 0 20px 10px rgba(255,255,255,.12), 0 0 4px 1px rgba(0,0,0,.1), 0 3px 2px rgba(0,0,0,.2)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        champ: {
          "50": "hsl(var(--champ-50))",
          "100": "hsl(var(--champ-100))",
          "200": "hsl(var(--champ-200))",
          "300": "hsl(var(--champ-300))",
          "400": "hsl(var(--champ-400))",
          "500": "hsl(var(--champ-500))",
          "600": "hsl(var(--champ-600))",
          "700": "hsl(var(--champ-700))",
          "800": "hsl(var(--champ-800))",
          "900": "hsl(var(--champ-900))",
        },
        golf: {
          "50": "#f6fdf4",
          "100": "#e8f9e4",
          "200": "#cef2c5",
          "300": "#a6e59b",
          "400": "#74d064",
          "500": "#4bb83a",
          "600": "#38a02a",
          "700": "#2d7d23",
          "800": "#266420",
          "900": "#1f531b",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        btnClick: {
          "0%, 100%": {
            transform: "scale(1)",
          },
          "50%": {
            transform: "scale(0.85)",
          },
        },
        toggleClick: {
          "0%, 100%": {
            transform: "scale(1)",
          },
          "50%": {
            transform: "scale(0.9)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        btnClick: "btnClick 150ms ease-in-out",
        toggleClick: "toggleClick 75ms ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
