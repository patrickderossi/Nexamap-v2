# Nexamap - Geospatial Property Analysis Tool

## Overview
A full-stack geospatial real estate and property analysis application focused on Western Australia. Features interactive maps, cadastral data, subdivision tools, lot yield estimation, and property listings.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS 3, Radix UI, Leaflet/Esri-Leaflet
- **Backend**: Express.js (integrated via Vite plugin in dev)
- **Database/Auth**: Supabase
- **Geospatial**: Turf.js, Proj4, Martinez polygon clipping

## Project Structure
- `client/` - React frontend (entry: `client/App.tsx`)
  - `client/components/` - React components
  - `client/hooks/` - Custom React hooks
  - `client/lib/` - Utility libraries (SLIP WA API, logger, email service, etc.)
- `server/` - Express backend (entry: `server/index.ts`)
  - `server/routes/` - API route handlers
  - `server/services/` - Backend services (email)
  - `server/middleware/` - Auth middleware
- `shared/` - Shared types (`shared/types.ts` — SelectedParcel, PropertyData, CadastralInfo, EsriGeometry)
- `public/` - Static assets

## Running
- Dev: `pnpm dev` (serves on port 5000)
- Build: `pnpm build`
- Production: `pnpm start`

## Layout
- **Left sidebar** (350px): Property details, listings tabs — toggle with chevron
- **Right sidebar** (280px): Map Layers + Analysis Tools — toggle with chevron
- **Floating panels**: Lot Yield, Feasibility Study, Setback Analysis, Valuation Estimate open as draggable overlays (DraggablePanel)

## Key Configuration
- Vite dev server runs on port 5000 (configured for Replit webview)
- Express server runs as Vite middleware in development
- Google Maps API key needed for place search functionality

## Logging
- Client-side logging uses `devLog` from `client/lib/logger.ts` (suppressed in production)
- Server-side uses standard `console.log`/`console.error`

## Security
- CORS uses proper URL hostname parsing (not string includes) for origin validation
- Welcome email endpoint requires JWT authentication
- TLS config uses minimum TLSv1.2 (no insecure fallbacks)

## Valuation Estimate (Analysis Tool)
- **Two access modes**:
  1. **Auto-inline** (PropertyInfoPanel): When a property is clicked, valuation auto-fetches using suburb + lot size from cadastral data and displays inline in the left sidebar Property tab. Shows loading skeleton, value range, price/m², confidence, expandable comparables, and error states.
  2. **Manual DraggablePanel** (ValuationEstimatePanel): Triggered via button in right sidebar Analysis Tools. Three-phase flow: auto-lookup → auto-fill/manual input → results with beds/baths/parking adjustments.
- **Data flow (inline)**: MapFirstLayout.handlePropertySelect → fetches valuation → passes valuationData/valuationLoading/valuationError through PropertyInfoTabs → PropertyInfoPanel → ValuationSection component
- **Race condition protection**: Uses incrementing request ID ref to discard stale responses on rapid property changes
- **Backend services** (`server/services/realEstateScraperService.ts`):
  - `lookupPropertyDetails(address, suburb)` — searches buy then sold listings via address matching
  - `estimatePropertyValue(suburb, lotSize, beds?, baths?)` — weighted-median with similarity scoring, suburb-tiered land values
- **Endpoints**:
  - `GET /api/listings/property-lookup?address=X&suburb=Y` — auto-detect property details
  - `GET /api/listings/estimate?suburb=X&lotSize=Y&bedrooms=N&bathrooms=N` — run valuation
- **Client service**: `client/lib/valuation-service.ts` — `lookupPropertyDetails()` + `fetchPropertyValuation()`
- **Zyla API**: Australian Property Insights API (ID 7297), endpoint 11581. `ZYLA_API_KEY` secret required.

## Deployment
- **Build**: `npm run build` (Vite SPA + server bundle)
- **Run**: `node dist/server/node-build.mjs`
- **Port**: Must use port 5000 (both dev and production) — Replit forwards 5000 → external port 80
- **Express 5**: Uses `/{*splat}` syntax for catch-all routes (bare `*` is invalid in path-to-regexp v8+)

## Types
- `shared/types.ts` defines `SelectedParcel`, `PropertyData`, `CadastralInfo`, `EsriGeometry`, `PropertyValuation`, `ComparableListing` — used across 14+ components
- Cadastral fetch logic centralized in `client/lib/slip-wa-api.ts` via `fetchCadastralFeature()`
