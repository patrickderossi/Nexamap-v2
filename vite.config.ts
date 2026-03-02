import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5000,
    allowedHosts: true,
    watch: {
      ignored: ["**/node_modules/**", "**/.local/**", "**/.git/**"],
    },
    fs: {
      allow: ["./client", "./shared", "./node_modules"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
    // Enable code splitting and chunk optimization
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and performance
        manualChunks: {
          // Vendor libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@radix-ui/react-accordion', '@radix-ui/react-alert-dialog', '@radix-ui/react-avatar', '@radix-ui/react-checkbox', '@radix-ui/react-collapsible', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-label', '@radix-ui/react-popover', '@radix-ui/react-progress', '@radix-ui/react-radio-group', '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-separator', '@radix-ui/react-slider', '@radix-ui/react-switch', '@radix-ui/react-tabs', '@radix-ui/react-toast', '@radix-ui/react-tooltip'],
          'vendor-maps': ['leaflet', 'esri-leaflet', '@geoman-io/leaflet-geoman-free'],
          'vendor-geospatial': ['@turf/turf', '@turf/projection', 'proj4', 'martinez-polygon-clipping'],
          'vendor-utils': ['@tanstack/react-query', 'clsx', 'class-variance-authority', 'tailwind-merge', 'date-fns', 'zod'],
          'vendor-icons': ['lucide-react'],

          // Application chunks
          'core-components': [
            './client/components/ui/button.tsx',
            './client/components/ui/card.tsx',
            './client/components/ui/input.tsx',
            './client/components/ui/select.tsx',
            './client/components/ui/tooltip.tsx'
          ]
        },
        // Optimize chunk naming for better caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()?.replace('.tsx', '').replace('.ts', '')
            : 'chunk';
          return `assets/${facadeModuleId}-[hash].js`;
        },
        // Optimize asset naming
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Optimize build target for modern browsers
    target: 'es2020',
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable source maps for debugging
    sourcemap: mode === 'development',
    // Minimize for production
    minify: mode === 'production' ? 'esbuild' : false,
    // Enable compression
    reportCompressedSize: true
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'leaflet',
      'esri-leaflet',
      '@geoman-io/leaflet-geoman-free',
      '@turf/turf',
      'clsx',
      'class-variance-authority',
      'tailwind-merge'
    ],
    // Exclude heavy libraries from optimization to speed up dev
    exclude: ['@tarikjabiri/dxf']
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
