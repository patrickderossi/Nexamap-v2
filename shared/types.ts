export interface CadastralInfo {
  land_id?: number;
  road_number_1?: string;
  road_name?: string;
  road_type?: string;
  locality?: string;
  lot_number?: string;
}

export interface PropertyData {
  lotSize?: string;
  lotDimensions?: string;
  planNumber?: string;
  zoning?: string;
  rCode?: string;
  shire?: string;
  landUse?: string;
  bushfire?: string;
  heritage?: string;
  floodRisk?: string;
  contamination?: string;
  easements?: string;
  soilType?: string;
  coordinates?: [number, number];
  boundaryLengths?: string[];
  perimeter?: string;
  interiorAngles?: string[];
  area?: number | string;
  cadastralInfo?: CadastralInfo;
  valuation?: PropertyValuation;
}

export interface EsriGeometry {
  rings: number[][][];
}

export interface SelectedParcel {
  data: PropertyData;
  coordinates: [number, number];
  address: string;
  geometry?: EsriGeometry;
}

export interface ComparableListing {
  address: string;
  price: number;
  landSize: number;
  pricePerSqm: number;
}

export interface PropertyValuation {
  estimatedValue: { low: number; mid: number; high: number };
  pricePerSqm: { low: number; median: number; high: number };
  comparableCount: number;
  comparables: ComparableListing[];
  suburb: string;
}
