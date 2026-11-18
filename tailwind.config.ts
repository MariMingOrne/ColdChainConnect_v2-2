import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        rajdhani: ["Rajdhani", "Barlow", "system-ui", "sans-serif"],
        barlow: ["Barlow", "system-ui", "sans-serif"],
        "barlow-cond": ["Barlow", "system-ui", "sans-serif"],
      },
      // px type scale (ratio ~1.15) on a 14px root: rem spacing stays as it was,
      // while the smallest text is 12px instead of 10.5px.
      fontSize: {
        "2xs": ["11px", { lineHeight: "14px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["15px", { lineHeight: "22px" }],
        lg: ["17px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "30px" }],
        "3xl": ["28px", { lineHeight: "34px" }],
        "4xl": ["34px", { lineHeight: "40px" }],
        "5xl": ["42px", { lineHeight: "48px" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          "2": "hsl(var(--link))",
        },
        link: "hsl(var(--link))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success-soft))" },
        warning: { DEFAULT: "hsl(var(--warning))", soft: "hsl(var(--warning-soft))" },
        "info-soft": "hsl(var(--info-soft))",
        "destructive-soft": "hsl(var(--destructive-soft))",
        "success-soft": "hsl(var(--success-soft))",
        "warning-soft": "hsl(var(--warning-soft))",
        "brand-gold": { DEFAULT: "hsl(var(--brand-gold))", foreground: "hsl(var(--brand-gold-foreground))" },
        chrome: {
          DEFAULT: "hsl(var(--chrome))",
          raised: "hsl(var(--chrome-raised))",
          foreground: "hsl(var(--chrome-foreground))",
          muted: "hsl(var(--chrome-muted))",
          border: "hsl(var(--chrome-border))",
        },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Legacy brand names: kept resolvable while screens migrate to the semantic names above.
        navy: {
          DEFAULT: "hsl(var(--navy))",
          dark: "hsl(var(--navy-dark))",
          mid: "hsl(var(--navy-mid))",
          light: "hsl(var(--navy-light))",
          card: "hsl(var(--navy-card))",
        },
        gold: "hsl(var(--gold))",
        green: "hsl(var(--green))",
        red: "hsl(var(--red))",
        yellow: "hsl(var(--yellow))",
        "off-white": "hsl(var(--off-white))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
