/**
 * Setback geometry calculations for property visualization
 * Uses turf.js for precise geometric operations
 */

import * as turf from '@turf/turf';
import { devLog } from './logger';
import type { SetbackRequirements } from './setback-requirements';

export interface SetbackGeometry {
  primaryStreetLine: GeoJSON.Feature<GeoJSON.LineString> | null;
  secondaryStreetLines: GeoJSON.Feature<GeoJSON.LineString>[];
  rearOtherLines: GeoJSON.Feature<GeoJSON.LineString>[];
  buildablePolygon: GeoJSON.Feature<GeoJSON.Polygon>;
  maxFootprintPolygon?: GeoJSON.Feature<GeoJSON.Polygon>; // Optional for info panel only
}

/**
 * Identify property edges that adjoin street polygons (abnormally large polygons)
 * This approach uses spatial analysis to find which edges touch street polygons
 */
function identifyStreetAdjacentEdges(
  propertyGeometry: GeoJSON.Feature<GeoJSON.Polygon>,
  allPolygons?: GeoJSON.Feature<GeoJSON.Polygon>[] // All polygons on the map for comparison
) {
  const coordinates = propertyGeometry.geometry.coordinates[0];
  const edges = [];
  const propertyArea = turf.area(propertyGeometry);

  // Calculate all property edges
  for (let i = 0; i < coordinates.length - 1; i++) {
    const start = coordinates[i];
    const end = coordinates[i + 1];

    const length = turf.length(turf.lineString([start, end]), { units: 'meters' });

    edges.push({
      start,
      end,
      length,
      coordinates: [start, end],
      index: i,
      adjacentToStreet: false, // Will be determined below
      streetType: null // 'primary' or 'secondary'
    });
  }

  // If we have access to all polygons, find abnormally large ones (streets)
  if (allPolygons && allPolygons.length > 0) {
    devLog.log('🛣️ Analyzing polygon adjacency for street detection...');

    // Find polygons that are much larger than the current property (likely streets)
    const streetPolygons = allPolygons.filter(polygon => {
      if (!polygon || !polygon.geometry) return false;
      const area = turf.area(polygon);
      // Consider polygons that are at least 10x larger than the property as streets
      return area > propertyArea * 10;
    });

    devLog.log(`📊 Found ${streetPolygons.length} potential street polygons (>10x property size)`);

    // Check each property edge for adjacency to street polygons
    edges.forEach((edge, index) => {
      const edgeLine = turf.lineString(edge.coordinates);

      for (const streetPolygon of streetPolygons) {
        try {
          // Check if the edge intersects or is very close to the street polygon
          const streetBoundaryRaw = turf.polygonToLine(streetPolygon);

          // Handle different return types from polygonToLine
          let streetBoundary: GeoJSON.Feature<GeoJSON.LineString>;

          if (streetBoundaryRaw.type === 'FeatureCollection') {
            // If it's a FeatureCollection, take the first feature
            const firstFeature = streetBoundaryRaw.features[0];
            if (firstFeature.geometry.type === 'LineString') {
              streetBoundary = firstFeature as GeoJSON.Feature<GeoJSON.LineString>;
            } else {
              // MultiLineString case - take first line
              streetBoundary = {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: firstFeature.geometry.coordinates[0]
                },
                properties: firstFeature.properties
              };
            }
          } else {
            // It's a Feature
            if (streetBoundaryRaw.geometry.type === 'LineString') {
              streetBoundary = streetBoundaryRaw as GeoJSON.Feature<GeoJSON.LineString>;
            } else {
              // MultiLineString case - take first line
              streetBoundary = {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: streetBoundaryRaw.geometry.coordinates[0]
                },
                properties: streetBoundaryRaw.properties
              };
            }
          }
          const intersection = turf.lineIntersect(edgeLine, streetBoundary);

          // Also check if the edge is very close to the street boundary
          const edgeMidpoint = turf.midpoint(
            turf.point(edge.start),
            turf.point(edge.end)
          );
          const distanceToStreet = turf.pointToLineDistance(edgeMidpoint, streetBoundary, { units: 'meters' });

          // Consider edge adjacent to street if it intersects or is within 2 meters
          if (intersection.features.length > 0 || distanceToStreet < 2) {
            edge.adjacentToStreet = true;
            devLog.log(`🛣️ Edge ${index + 1} is adjacent to street polygon`);
            break;
          }
        } catch (error) {
          devLog.warn('Error checking edge-street adjacency:', error);
        }
      }
    });
  } else {
    devLog.log('⚠️ No polygon data available, falling back to longest edge heuristic');
    // Fallback: assume longest edge(s) face streets
    const sortedEdges = [...edges].sort((a, b) => b.length - a.length);
    if (sortedEdges.length > 0) {
      sortedEdges[0].adjacentToStreet = true;
      sortedEdges[0].streetType = 'primary';

      // Check for potential secondary street (perpendicular to primary)
      if (sortedEdges.length > 1) {
        const primaryBearing = Math.atan2(
          sortedEdges[0].end[1] - sortedEdges[0].start[1],
          sortedEdges[0].end[0] - sortedEdges[0].start[0]
        ) * 180 / Math.PI;

        for (let i = 1; i < Math.min(3, sortedEdges.length); i++) {
          const edge = sortedEdges[i];
          const edgeBearing = Math.atan2(
            edge.end[1] - edge.start[1],
            edge.end[0] - edge.start[0]
          ) * 180 / Math.PI;

          const bearingDiff = Math.abs(primaryBearing - edgeBearing);
          const normalizedDiff = Math.min(bearingDiff, 360 - bearingDiff);

          if (normalizedDiff >= 80 && normalizedDiff <= 100 &&
              edge.length >= sortedEdges[0].length * 0.4) {
            edge.adjacentToStreet = true;
            edge.streetType = 'secondary';
            break;
          }
        }
      }
    }
  }

  // Identify street-adjacent edges
  const streetAdjacentEdges = edges.filter(edge => edge.adjacentToStreet);

  // Classify them as primary vs secondary
  let primaryStreetEdge = null;
  let secondaryStreetEdge = null;

  if (streetAdjacentEdges.length > 0) {
    // Primary is typically the longest street-adjacent edge
    primaryStreetEdge = streetAdjacentEdges.reduce((prev, current) =>
      current.length > prev.length ? current : prev
    );
    primaryStreetEdge.streetType = 'primary';

    // Secondary is any other street-adjacent edge
    secondaryStreetEdge = streetAdjacentEdges.find(edge =>
      edge !== primaryStreetEdge
    );
    if (secondaryStreetEdge) {
      secondaryStreetEdge.streetType = 'secondary';
    }
  }

  devLog.log('🏠 Street adjacency analysis:', {
    totalEdges: edges.length,
    streetAdjacentEdges: streetAdjacentEdges.length,
    primaryStreetEdge: primaryStreetEdge ? `${Math.round(primaryStreetEdge.length)}m` : 'none',
    secondaryStreetEdge: secondaryStreetEdge ? `${Math.round(secondaryStreetEdge.length)}m` : 'none',
    blockType: secondaryStreetEdge ? 'corner' : 'regular'
  });

  return {
    primaryStreetEdge,
    secondaryStreetEdge,
    blockType: secondaryStreetEdge ? 'corner' : 'regular',
    streetAdjacentEdges,
    allEdges: edges
  };
}

/**
 * Create a setback line for a specific property edge
 */
function createEdgeSetback(
  edge: any,
  setbackDistance: number,
  propertyGeometry: GeoJSON.Feature<GeoJSON.Polygon>,
  type: string
): GeoJSON.Feature<GeoJSON.LineString> | null {
  try {
    // Create a line that's offset inward from the edge by the setback distance
    const [start, end] = edge.coordinates;

    // Calculate the perpendicular vector (inward normal)
    const edgeVector = [end[0] - start[0], end[1] - start[1]];
    const edgeLength = Math.sqrt(edgeVector[0] * edgeVector[0] + edgeVector[1] * edgeVector[1]);
    const normalizedEdge = [edgeVector[0] / edgeLength, edgeVector[1] / edgeLength];

    // Get perpendicular vector (rotate 90 degrees clockwise)
    const perpendicular = [normalizedEdge[1], -normalizedEdge[0]];

    // Convert setback distance to coordinate units (rough approximation)
    const offsetDistance = setbackDistance / 111000; // Very rough meters to degrees conversion

    // Create offset points
    const offsetStart = [
      start[0] + perpendicular[0] * offsetDistance,
      start[1] + perpendicular[1] * offsetDistance
    ];
    const offsetEnd = [
      end[0] + perpendicular[0] * offsetDistance,
      end[1] + perpendicular[1] * offsetDistance
    ];

    return {
      type: 'Feature',
      properties: { type, setback: setbackDistance, edge: 'specific' },
      geometry: {
        type: 'LineString',
        coordinates: [offsetStart, offsetEnd]
      }
    };
  } catch (error) {
    devLog.warn('Error creating edge setback:', error);
    return null;
  }
}

/**
 * Calculate setback lines and buildable area from property geometry
 * Uses proper polygon buffering to follow the actual property shape
 * Now includes smart edge detection for targeted setback lines
 */
export function calculateSetbackGeometry(
  propertyGeometry: GeoJSON.Feature<GeoJSON.Polygon>,
  setbacks: SetbackRequirements,
  lotArea: number,
  includeFootprint: boolean = false,
  allPolygons?: GeoJSON.Feature<GeoJSON.Polygon>[] // All polygons for street detection
): SetbackGeometry | null {
  try {
    devLog.log('🏗️ Calculating setback geometry with smart edge detection');

    // Identify edges that adjoin street polygons (abnormally large polygons)
    const streetEdges = identifyStreetAdjacentEdges(propertyGeometry, allPolygons);
    devLog.log('🎯 Street adjacency analysis:', {
      blockType: streetEdges.blockType,
      primaryStreet: streetEdges.primaryStreetEdge ? 'detected' : 'none',
      secondaryStreet: streetEdges.secondaryStreetEdge ? 'detected' : 'none'
    });

    // Convert meters to kilometers for turf.buffer (turf uses kilometers)
    const primaryStreetSetbackKm = setbacks.front / 1000;
    const secondaryStreetSetbackKm = setbacks.secondaryStreet / 1000;
    const rearSetbackKm = (typeof setbacks.rearOther === 'number' ? setbacks.rearOther : 4) / 1000;

    // Use the largest setback for the overall buildable area
    const maxSetbackKm = Math.max(primaryStreetSetbackKm, secondaryStreetSetbackKm, rearSetbackKm);

    // Create inward buffer (negative buffer) to get buildable area
    // For simplicity, we'll use the average setback distance
    const avgSetbackKm = (primaryStreetSetbackKm + secondaryStreetSetbackKm + rearSetbackKm) / 3;

    let buildablePolygon: GeoJSON.Feature<GeoJSON.Polygon>;

    try {
      // Create inward buffer (negative buffer) that follows the property shape
      const bufferedGeometry = turf.buffer(propertyGeometry, -avgSetbackKm, { units: 'kilometers' });

      if (bufferedGeometry && bufferedGeometry.geometry.type === 'Polygon') {
        buildablePolygon = bufferedGeometry as GeoJSON.Feature<GeoJSON.Polygon>;
        buildablePolygon.properties = { type: 'buildable-area' };
      } else {
        throw new Error('Buffer operation failed or returned invalid geometry');
      }
    } catch (bufferError) {
      devLog.warn('Buffer operation failed, falling back to smaller buffer:', bufferError);
      // Fallback: try with a smaller buffer
      const smallerBuffer = -avgSetbackKm * 0.5;
      const fallbackGeometry = turf.buffer(propertyGeometry, smallerBuffer, { units: 'kilometers' });

      if (fallbackGeometry && fallbackGeometry.geometry.type === 'Polygon') {
        buildablePolygon = fallbackGeometry as GeoJSON.Feature<GeoJSON.Polygon>;
        buildablePolygon.properties = { type: 'buildable-area' };
      } else {
        // Last resort: create a centroid-based small polygon
        const centroid = turf.centroid(propertyGeometry);
        const smallArea = turf.buffer(centroid, avgSetbackKm, { units: 'kilometers' });
        buildablePolygon = smallArea as GeoJSON.Feature<GeoJSON.Polygon>;
        buildablePolygon.properties = { type: 'buildable-area' };
      }
    }

    // Create setback lines ONLY for street-facing edges
    // No setbacks on edges that adjoin other properties
    const primaryStreetLine = streetEdges.primaryStreetEdge
      ? createEdgeSetback(streetEdges.primaryStreetEdge, setbacks.front, propertyGeometry, 'primary-street')
      : null;

    const secondaryStreetLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    if (streetEdges.secondaryStreetEdge) {
      const secondaryLine = createEdgeSetback(streetEdges.secondaryStreetEdge, setbacks.secondaryStreet, propertyGeometry, 'secondary-street');
      if (secondaryLine) {
        secondaryStreetLines.push(secondaryLine);
      }
    }

    // NO rear/other setback lines - these adjoin other properties
    const rearOtherLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    // Only calculate footprint polygon if requested (for info panel)
    let maxFootprintPolygon: GeoJSON.Feature<GeoJSON.Polygon> | undefined;

    if (includeFootprint) {
      // Calculate buildable area
      const buildableArea = turf.area(buildablePolygon);

      // Maximum footprint by site coverage
      const maxFootprintByCoverage = lotArea * (setbacks.maxSiteCoverage / 100);

      // Use smaller of buildable area or site coverage limit
      const finalMaxFootprint = Math.min(buildableArea, maxFootprintByCoverage);
      const coverageRatio = buildableArea > 0 ? finalMaxFootprint / buildableArea : 0.5;

      // Create scaled footprint polygon that fits within buildable area
      if (coverageRatio >= 0.95) {
        // If we can use almost all the buildable area, just use it directly
        maxFootprintPolygon = {
          ...buildablePolygon,
          properties: {
            type: 'max-footprint',
            area: finalMaxFootprint,
            coverage: (finalMaxFootprint / lotArea) * 100
          }
        };
      } else {
        // Scale down the buildable polygon
        const centroid = turf.centroid(buildablePolygon);
        const scaleFactor = Math.sqrt(coverageRatio);

        try {
          // Use turf.transformScale to scale the polygon from its centroid
          const scaledPolygon = turf.transformScale(buildablePolygon, scaleFactor, { origin: centroid });
          maxFootprintPolygon = {
            ...scaledPolygon,
            properties: {
              type: 'max-footprint',
              area: finalMaxFootprint,
              coverage: (finalMaxFootprint / lotArea) * 100
            }
          } as GeoJSON.Feature<GeoJSON.Polygon>;
        } catch (scaleError) {
          devLog.warn('Scale operation failed, using centroid buffer:', scaleError);
          // Fallback: create a buffer around the centroid
          const radius = Math.sqrt(finalMaxFootprint / Math.PI) / 1000; // Convert to km
          const centroidBuffer = turf.buffer(centroid, radius, { units: 'kilometers' });
          maxFootprintPolygon = {
            ...centroidBuffer,
            properties: {
              type: 'max-footprint',
              area: finalMaxFootprint,
              coverage: (finalMaxFootprint / lotArea) * 100
            }
          } as GeoJSON.Feature<GeoJSON.Polygon>;
        }
      }
    }

    devLog.log('✅ Setback geometry calculated - street-facing edges only:', {
      primaryStreetSetback: primaryStreetLine ? 'displayed' : 'none',
      secondaryStreetSetback: secondaryStreetLines.length > 0 ? 'displayed' : 'none',
      blockType: streetEdges.blockType
    });

    const result: SetbackGeometry = {
      primaryStreetLine,
      secondaryStreetLines,
      rearOtherLines,
      buildablePolygon
    };

    if (maxFootprintPolygon) {
      result.maxFootprintPolygon = maxFootprintPolygon;
    }

    return result;

  } catch (error) {
    console.error('❌ Error calculating setback geometry:', error);
    return null;
  }
}

/**
 * Extract boundary line from a buffered polygon
 */
function extractBoundaryLine(
  bufferedPolygon: GeoJSON.Feature | null,
  type: string,
  setback: number
): GeoJSON.Feature<GeoJSON.LineString> {
  if (!bufferedPolygon || bufferedPolygon.geometry.type !== 'Polygon') {
    // Fallback: create a simple line
    return {
      type: 'Feature',
      properties: { type, setback },
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0], [0.001, 0]]
      }
    };
  }

  // Convert polygon boundary to linestring
  const coords = bufferedPolygon.geometry.coordinates[0];

  return {
    type: 'Feature',
    properties: { type, setback },
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };
}

/**
 * Create Leaflet layers from setback geometry
 */
export function createSetbackLayers(geometry: SetbackGeometry) {
  const layers: L.GeoJSON[] = [];

  // Primary street setback line (blue) - targeted to front edge only
  if (geometry.primaryStreetLine && geometry.primaryStreetLine.geometry.coordinates.length > 0) {
    const primaryStreetLayer = L.geoJSON(geometry.primaryStreetLine, {
      style: {
        color: '#3B82F6',
        weight: 4,
        opacity: 1,
        dashArray: '10,5'
      }
    });
    layers.push(primaryStreetLayer);
  }

  // Secondary street setback lines (green) - targeted to secondary street edges only
  geometry.secondaryStreetLines.forEach((line, index) => {
    if (line && line.geometry.coordinates.length > 0) {
      const layer = L.geoJSON(line, {
        style: {
          color: '#10B981',
          weight: 4,
          opacity: 1,
          dashArray: '10,5'
        }
      });
      layers.push(layer);
    }
  });

  // Rear/other setback lines (orange) - targeted to rear/other edges only
  geometry.rearOtherLines.forEach((line, index) => {
    if (line && line.geometry.coordinates.length > 0) {
      const layer = L.geoJSON(line, {
        style: {
          color: '#F59E0B',
          weight: 4,
          opacity: 1,
          dashArray: '10,5'
        }
      });
      layers.push(layer);
    }
  });

  // Add buildable area outline (light gray dashed)
  if (geometry.buildablePolygon) {
    const buildableLayer = L.geoJSON(geometry.buildablePolygon, {
      style: {
        color: '#6B7280',
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.05,
        fillColor: '#6B7280',
        dashArray: '4,4'
      }
    });
    layers.push(buildableLayer);
  }

  return layers;
}

/**
 * Create max footprint polygon layer that follows property shape
 */
export function createFootprintLayer(geometry: SetbackGeometry): L.GeoJSON {
  return L.geoJSON(geometry.maxFootprintPolygon, {
    style: {
      color: '#EF4444',
      weight: 2,
      opacity: 1,
      fillColor: '#EF4444',
      fillOpacity: 0.25,
      dashArray: '6,3'
    },
    onEachFeature: (feature, layer) => {
      // Add popup with footprint information
      if (feature.properties) {
        const area = feature.properties.area || 0;
        const coverage = feature.properties.coverage || 0;
        layer.bindPopup(`
          <div class="text-sm">
            <strong>Maximum Building Footprint</strong><br>
            Area: ${Math.round(area)}m²<br>
            Site Coverage: ${coverage.toFixed(1)}%
          </div>
        `);
      }
    }
  });
}
