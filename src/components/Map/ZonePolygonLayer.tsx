import { GeoJSON } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';
import type { ZoneFeature } from '../../types/tree';
import { kmlPathStyle, kmlPointToLayer } from '../../services/kml/kmlLeafletStyle';
import { useFloraStore } from '../../store/useFloraStore';

interface Props {
  zones: ZoneFeature[];
  visible: boolean;
}

export function ZonePolygonLayer({ zones, visible }: Props) {
  const selectedZoneName = useFloraStore((s) => s.selectedZoneName);
  const zoneReviewMode = useFloraStore((s) => s.zoneReviewMode);
  const selectZone = useFloraStore((s) => s.selectZone);

  if (!visible || zones.length === 0) return null;

  return (
    <>
      {zones.map((zone) => {
        const isSelected = zone.name === selectedZoneName;
        const dimmed = zoneReviewMode && selectedZoneName && !isSelected;

        const feature: GeoJSON.Feature = {
          type: 'Feature',
          geometry: zone.geometry,
          properties: { ...zone.properties, name: zone.name },
        };

        const baseStyle = kmlPathStyle(zone.properties, zone.color);

        const style = (): PathOptions => {
          if (isSelected) {
            return {
              ...baseStyle,
              color: '#E0A73A',
              weight: (baseStyle.weight ?? 2) + 1,
              fillOpacity: Math.max(baseStyle.fillOpacity ?? 0.2, 0.3),
            };
          }
          if (dimmed) {
            return { ...baseStyle, opacity: 0.25, fillOpacity: 0.03 };
          }
          return baseStyle;
        };

        return (
          <GeoJSON
            key={`${zone.id}-${isSelected}-${dimmed}`}
            data={feature}
            style={style}
            pointToLayer={(f, latlng) => kmlPointToLayer(f, latlng, zone.color)}
            onEachFeature={(_feature, layer: Layer) => {
              layer.bindTooltip(zone.name, { sticky: true, direction: 'top' });
              layer.on('click', () => {
                selectZone(zone.name, false);
              });
            }}
          />
        );
      })}
    </>
  );
}
