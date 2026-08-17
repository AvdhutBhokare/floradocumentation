import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { useFloraStore } from '../../store/useFloraStore';

interface Props {
  onCursorMove: (lat: number, lng: number) => void;
}

/** Handles "+ Add Tree" map clicks and reports live cursor coordinates. */
export function MapInteractionLayer({ onCursorMove }: Props) {
  const map = useMap();
  const addTreeArmed = useFloraStore((s) => s.addTreeArmed);
  const setPendingMapClick = useFloraStore((s) => s.setPendingMapClick);

  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle('flora-add-tree-cursor', addTreeArmed);
    return () => container.classList.remove('flora-add-tree-cursor');
  }, [map, addTreeArmed]);

  useMapEvents({
    click(e) {
      if (!addTreeArmed) return;
      setPendingMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mousemove(e) {
      onCursorMove(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}
