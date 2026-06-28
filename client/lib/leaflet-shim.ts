// ---------------------------------------------------------------------------
// Minimal Leaflet → MapLibre compatibility shim.
//
// The app migrated from Leaflet to MapLibre, but SubdivisionManager is ~1,500
// lines of Leaflet-based drawing/geometry. Rather than rewrite all of it, this
// shim re-implements the small Leaflet surface it uses (L.geoJSON, L.polyline,
// L.marker, L.circleMarker, L.divIcon, L.latLng + layer add/remove/style/events)
// on top of a MapLibre map, so the component works unchanged.
//
// Notes:
//  - Leaflet uses [lat,lng] / {lat,lng}; MapLibre uses [lng,lat]. `toLngLat`
//    normalises. MapLibre's event `lngLat` already has .lat/.lng so it slots in.
//  - Layers expose `.remove()` (callers use `x.remove()` instead of
//    `map.removeLayer(x)`), `.setStyle`, `.setLatLng(s)`, `.getLatLngs`, `.on`.
// ---------------------------------------------------------------------------

import maplibregl from "maplibre-gl";

type AnyLatLng = { lat: number; lng: number } | [number, number];

function toLngLat(p: any): [number, number] {
  if (Array.isArray(p)) return [p[1], p[0]]; // Leaflet [lat,lng] → [lng,lat]
  return [p.lng, p.lat]; // {lat,lng} or MapLibre LngLat
}

let _uid = 0;
const nid = (p: string) => `${p}-${++_uid}`;

// Leaflet dash (pixels) → MapLibre line-dasharray (line-width units).
function dashArray(str: string | undefined, weight: number): number[] | undefined {
  if (!str) return undefined;
  const nums = str.split(/[ ,]+/).map((n) => parseFloat(n)).filter((n) => !isNaN(n));
  if (!nums.length) return undefined;
  const w = Math.max(weight, 1);
  return nums.map((n) => Math.max(n / w, 0.1));
}

abstract class ShimLayer {
  _map: maplibregl.Map | null = null;
  _src = nid("sub-src");
  _layers: string[] = [];
  _handlers = new Map<Function, (e: any) => void>();

  addTo(map: maplibregl.Map) {
    this._map = map;
    if (map.isStyleLoaded()) this._add();
    else map.once("idle", () => this._map && this._add());
    return this;
  }
  protected abstract _add(): void;

  remove() {
    const m = this._map;
    if (!m) return this;
    for (const [, wrapped] of this._handlers) {
      this._layers.forEach((l) => m.off("click", l, wrapped as any));
    }
    this._handlers.clear();
    this._layers.forEach((l) => { if (m.getLayer(l)) m.removeLayer(l); });
    if (m.getSource(this._src)) m.removeSource(this._src);
    this._map = null;
    return this;
  }

  on(evt: string, handler: (e: any) => void) {
    if (evt !== "click" || !this._map) return this;
    const wrapped = (e: any) => handler({ ...e, target: this });
    this._handlers.set(handler, wrapped);
    this._layers.forEach((l) => this._map!.on("click", l, wrapped as any));
    return this;
  }
  off(evt: string, handler: (e: any) => void) {
    const wrapped = this._handlers.get(handler);
    if (wrapped && this._map) this._layers.forEach((l) => this._map!.off("click", l, wrapped as any));
    this._handlers.delete(handler);
    return this;
  }
  protected _setData(data: any) {
    const s = this._map?.getSource(this._src) as maplibregl.GeoJSONSource | undefined;
    if (s) s.setData(data);
  }
}

class GeoJsonShim extends ShimLayer {
  _fill = nid("sub-fill");
  _line = nid("sub-line");
  constructor(private feature: any, private style: any = {}) { super(); }
  protected _add() {
    const m = this._map!;
    if (m.getSource(this._src)) return;
    m.addSource(this._src, { type: "geojson", data: this.feature });
    const s = this.style;
    m.addLayer({ id: this._fill, type: "fill", source: this._src,
      paint: { "fill-color": s.fillColor || s.color || "#3388ff", "fill-opacity": s.fillOpacity ?? 0.2 } });
    const linePaint: any = { "line-color": s.color || "#3388ff", "line-width": s.weight ?? 3, "line-opacity": s.opacity ?? 1 };
    const dash = dashArray(s.dashArray, s.weight ?? 3);
    if (dash) linePaint["line-dasharray"] = dash;
    m.addLayer({ id: this._line, type: "line", source: this._src, paint: linePaint });
    this._layers = [this._fill, this._line];
  }
  setStyle(s: any) {
    Object.assign(this.style, s);
    const m = this._map; if (!m || !m.getLayer(this._fill)) return this;
    if (s.fillColor || s.color) m.setPaintProperty(this._fill, "fill-color", s.fillColor || s.color);
    if (s.fillOpacity != null) m.setPaintProperty(this._fill, "fill-opacity", s.fillOpacity);
    if (s.color) m.setPaintProperty(this._line, "line-color", s.color);
    if (s.weight != null) m.setPaintProperty(this._line, "line-width", s.weight);
    if (s.opacity != null) m.setPaintProperty(this._line, "line-opacity", s.opacity);
    return this;
  }
}

class PolylineShim extends ShimLayer {
  _line = nid("sub-pl");
  coords: [number, number][];
  constructor(latlngs: AnyLatLng[], private style: any = {}) { super(); this.coords = latlngs.map(toLngLat); }
  private _feature() {
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: this.coords } };
  }
  protected _add() {
    const m = this._map!;
    if (m.getSource(this._src)) return;
    m.addSource(this._src, { type: "geojson", data: this._feature() as any });
    const s = this.style;
    const paint: any = { "line-color": s.color || "#3388ff", "line-width": s.weight ?? 3, "line-opacity": s.opacity ?? 1 };
    const dash = dashArray(s.dashArray, s.weight ?? 3);
    if (dash) paint["line-dasharray"] = dash;
    m.addLayer({ id: this._line, type: "line", source: this._src,
      layout: { "line-cap": s.lineCap || "butt", "line-join": "round" }, paint });
    this._layers = [this._line];
  }
  setLatLngs(latlngs: AnyLatLng[]) { this.coords = latlngs.map(toLngLat); this._setData(this._feature()); return this; }
  getLatLngs() { return this.coords.map(([lng, lat]) => ({ lat, lng })); }
  setStyle(s: any) {
    Object.assign(this.style, s);
    const m = this._map; if (!m || !m.getLayer(this._line)) return this;
    if (s.color) m.setPaintProperty(this._line, "line-color", s.color);
    if (s.weight != null) m.setPaintProperty(this._line, "line-width", s.weight);
    if (s.opacity != null) m.setPaintProperty(this._line, "line-opacity", s.opacity);
    return this;
  }
}

class CircleMarkerShim extends ShimLayer {
  _circle = nid("sub-cm");
  pos: [number, number];
  constructor(latlng: AnyLatLng, private style: any = {}) { super(); this.pos = toLngLat(latlng); }
  private _feature() { return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: this.pos } }; }
  protected _add() {
    const m = this._map!;
    if (m.getSource(this._src)) return;
    m.addSource(this._src, { type: "geojson", data: this._feature() as any });
    const s = this.style;
    m.addLayer({ id: this._circle, type: "circle", source: this._src, paint: {
      "circle-radius": s.radius ?? 6,
      "circle-color": s.fillColor || s.color || "#3388ff",
      "circle-opacity": s.fillOpacity ?? 1,
      "circle-stroke-color": s.color || "#3388ff",
      "circle-stroke-width": s.weight ?? 1,
    } });
    this._layers = [this._circle];
  }
  setLatLng(latlng: AnyLatLng) { this.pos = toLngLat(latlng); this._setData(this._feature()); return this; }
  setStyle(s: any) {
    Object.assign(this.style, s);
    const m = this._map; if (!m || !m.getLayer(this._circle)) return this;
    if (s.fillColor || s.color) m.setPaintProperty(this._circle, "circle-color", s.fillColor || s.color);
    if (s.color) m.setPaintProperty(this._circle, "circle-stroke-color", s.color);
    return this;
  }
}

// L.marker with an L.divIcon → a MapLibre Marker wrapping the icon's HTML.
class MarkerShim {
  _marker: maplibregl.Marker | null = null;
  pos: [number, number];
  constructor(latlng: AnyLatLng, private options: any = {}) { this.pos = toLngLat(latlng); }
  addTo(map: maplibregl.Map) {
    const icon = this.options.icon || { html: "", iconSize: [0, 0], iconAnchor: [0, 0] };
    const el = document.createElement("div");
    el.innerHTML = icon.html || "";
    if (icon.className) el.className = icon.className;
    if (this.options.interactive === false) el.style.pointerEvents = "none";
    if (this.options.zIndexOffset) el.style.zIndex = String(this.options.zIndexOffset);
    const [ix, iy] = icon.iconSize || [0, 0];
    const [ax, ay] = icon.iconAnchor || [ix / 2, iy / 2];
    this._marker = new maplibregl.Marker({
      element: el,
      anchor: "center",
      offset: [ix / 2 - ax, iy / 2 - ay],
      draggable: !!this.options.draggable,
    }).setLngLat(this.pos).addTo(map);
    return this;
  }
  setLatLng(latlng: AnyLatLng) { this.pos = toLngLat(latlng); this._marker?.setLngLat(this.pos); return this; }
  setIcon(icon: any) { this.options.icon = icon; if (this._marker) this._marker.getElement().innerHTML = icon.html || ""; return this; }
  getLatLng() {
    const ll = this._marker?.getLngLat();
    return ll ? { lat: ll.lat, lng: ll.lng } : { lat: this.pos[1], lng: this.pos[0] };
  }
  setStyle() { return this; }
  // Forward Leaflet drag events to the underlying MapLibre marker.
  on(evt: string, handler: (e: any) => void) {
    if (this._marker && /^(drag|dragstart|dragend)$/.test(evt)) {
      this._marker.on(evt as any, () => handler({ target: this }));
    }
    return this;
  }
  off() { return this; }
  remove() { this._marker?.remove(); this._marker = null; return this; }
}

const L = {
  geoJSON: (feature: any, options: any = {}) => new GeoJsonShim(feature, options.style),
  polyline: (latlngs: AnyLatLng[], options: any = {}) => new PolylineShim(latlngs, options),
  marker: (latlng: AnyLatLng, options: any = {}) => new MarkerShim(latlng, options),
  circleMarker: (latlng: AnyLatLng, options: any = {}) => new CircleMarkerShim(latlng, options),
  divIcon: (options: any) => ({ ...options }),
  latLng: (lat: number, lng: number) => ({ lat, lng }),
};

export default L;
