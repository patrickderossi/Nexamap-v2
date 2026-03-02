declare module "esri-leaflet" {
  export function featureLayer(options?: any): any;
  export function basemapLayer(key: string, options?: any): any;
  export function tiledMapLayer(options?: any): any;
  export function dynamicMapLayer(options?: any): any;
  export function imageMapLayer(options?: any): any;
  export function clusteredFeatureLayer(options?: any): any;
  export function heatmapFeatureLayer(options?: any): any;
  export namespace Util {
    export function warn(message: string): void;
    export function cleanUrl(url: string): string;
    export function getUrlParams(url: string): any;
    export function isArcgisOnline(url: string): boolean;
    export function geojsonTypeToArcGIS(geoJsonType: string): string;
    export function responseToFeatureCollection(
      response: any,
      idAttribute?: string,
    ): any;
    export function arcgisToGeoJSON(arcgis: any, idAttribute?: string): any;
    export function geojsonToArcGIS(geojson: any, idAttribute?: string): any;
  }
}
