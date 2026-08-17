export interface BaseMapTileConfig {
  url: string;
  attribution: string;
  /** Highest zoom level the tile server provides natively */
  maxNativeZoom: number;
}

/** Leaflet max zoom — allows over-zooming past native tile resolution for precise placement */
export const MAP_MAX_ZOOM = 22;

export const STREET_TILE: BaseMapTileConfig = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxNativeZoom: 19,
};

const DEFAULT_SATELLITE_TILE: BaseMapTileConfig = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxNativeZoom: 19,
};

const envSatelliteUrl = (import.meta.env.VITE_SATELLITE_TILE_URL as string | undefined)?.trim();
const envSatelliteAttribution = (
  import.meta.env.VITE_SATELLITE_TILE_ATTRIBUTION as string | undefined
)?.trim();

/** Built-in Esri World Imagery unless overridden via .env */
export const SATELLITE_TILE: BaseMapTileConfig = {
  url: envSatelliteUrl || DEFAULT_SATELLITE_TILE.url,
  attribution: envSatelliteAttribution || DEFAULT_SATELLITE_TILE.attribution,
  maxNativeZoom: DEFAULT_SATELLITE_TILE.maxNativeZoom,
};
