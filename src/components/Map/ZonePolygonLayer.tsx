import { GeoJSON } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';
import type { ZoneFeature } from '../../types/tree';
import { isBoundaryGeometry } from '../../services/gis/zoneBoundaries';
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

  const boundaryZones = zones.filter((zone) => isBoundaryGeometry(zone.geometry));
  if (boundaryZones.length === 0) return null;

  return (
    <>
      {boundaryZones.map((zone) => {
        const isSelected = zone.name === selectedZoneName;
        const dimmed = zoneReviewMode && selectedZoneName && !isSelected;

        const style: PathOptions = {
          color: isSelected ? '#E0A73A' : zone.color,
          weight: isSelected ? 3 : 2,
          fillColor: zone.color,
          fillOpacity: dimmed ? 0.03 : isSelected ? 0.28 : 0.14,
          opacity: dimmed ? 0.25 : 1,
        };

        return (
          <GeoJSON
            key={`${zone.id}-${isSelected}-${dimmed}`}
            data={zone.geometry as GeoJSON.Geometry}
            style={style}
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
