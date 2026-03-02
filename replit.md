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
- **Floating panels**: Lot Yield, Feasibility Study, Setback Analysis open as draggable overlays (DraggablePanel)

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

## Property Valuation Feature
- **Server**: `estimatePropertyValue()` in `server/services/realEstateScraperService.ts` — percentile-based price-per-sqm calculation
- **Endpoint**: `GET /api/listings/estimate?suburb=X&lotSize=Y` in `server/routes/listings.ts`
- **Client service**: `client/lib/valuation-service.ts` — `fetchPropertyValuation(suburb, lotSize)`
- **UI**: Green card in `PropertyInfoPanel.tsx` with value range, price/m², expandable comparables, disclaimer
- **Integration**: `MapFirstLayout.tsx` `handlePropertySelect` fires valuation fetch after property data loads (non-blocking)
- **Status**: Code complete; requires active Zyla Australia Realty API subscription (`ZYLA_API_KEY` secret). Gracefully absent when API unavailable.

## Types
- `shared/types.ts` defines `SelectedParcel`, `PropertyData`, `CadastralInfo`, `EsriGeometry`, `PropertyValuation`, `ComparableListing` — used across 14+ components
- Cadastral fetch logic centralized in `client/lib/slip-wa-api.ts` via `fetchCadastralFeature()`
