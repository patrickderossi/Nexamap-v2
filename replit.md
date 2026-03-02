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
- `server/` - Express backend (entry: `server/index.ts`)
- `shared/` - Shared types/utilities
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
