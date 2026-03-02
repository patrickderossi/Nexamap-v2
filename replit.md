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
- **Architecture**: DraggablePanel in right sidebar, same pattern as Lot Yield/Feasibility/Setback tools
- **Button**: `ValuationEstimateButton.tsx` — emerald-themed, in MainToolbar under Analysis Tools
- **Panel**: `ValuationEstimatePanel.tsx` — three-phase flow:
  1. **Auto-lookup phase**: Searches Zyla buy+sold listings for the clicked property's address to auto-detect beds/baths/parking
  2. **Auto-valuation**: If found, auto-fills details and immediately runs valuation
  3. **Manual fallback**: If not found, shows input form for user to enter beds/baths/parking manually
- **Backend services** (`server/services/realEstateScraperService.ts`):
  - `lookupPropertyDetails(address, suburb)` — searches buy then sold listings via address matching (normalised street names/numbers)
  - `estimatePropertyValue(suburb, lotSize, beds?, baths?)` — weighted-median with similarity scoring, suburb-tiered land values ($250/$400/$600 per sqm for outer/mid/inner suburbs)
- **Endpoints**:
  - `GET /api/listings/property-lookup?address=X&suburb=Y` — auto-detect property details
  - `GET /api/listings/estimate?suburb=X&lotSize=Y&bedrooms=N&bathrooms=N` — run valuation
- **Client service**: `client/lib/valuation-service.ts` — `lookupPropertyDetails()` + `fetchPropertyValuation()`
- **Zyla API**: Australian Property Insights API (ID 7297), endpoint 11581. `ZYLA_API_KEY` secret required.
- **Valuation logic**: Adapted from Chrome extension — similarity scoring (beds ±30pts, baths ±5pts, perfect match +50pts), suburb-tiered land values, parking adjustments, weighted median, confidence levels
- **Status**: Fully operational with auto-detection and manual fallback

## Types
- `shared/types.ts` defines `SelectedParcel`, `PropertyData`, `CadastralInfo`, `EsriGeometry`, `PropertyValuation`, `ComparableListing` — used across 14+ components
- Cadastral fetch logic centralized in `client/lib/slip-wa-api.ts` via `fetchCadastralFeature()`
