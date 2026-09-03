export const MAP_MARKER_SIZE = 30
export const MAP_MARKER_POPUP_GAP = 18

function locationKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`
}

export function iconAnchorForGroup(
  indexInGroup: number,
  groupSize: number,
  markerSize = MAP_MARKER_SIZE,
): [number, number] {
  const center = markerSize / 2
  if (groupSize <= 1) return [center, center]
  const radius = 14
  const angle = (2 * Math.PI * indexInGroup) / groupSize
  return [center - Math.cos(angle) * radius, center - Math.sin(angle) * radius]
}

export function popupAnchorForIcon(iconAnchor: [number, number], markerSize = MAP_MARKER_SIZE): [number, number] {
  return [markerSize / 2 - iconAnchor[0], markerSize / 2 - iconAnchor[1] - MAP_MARKER_POPUP_GAP]
}

export function placeOverlappingMarkers<T extends { latitude: number; longitude: number }>(
  items: T[],
): Array<{ item: T; iconAnchor: [number, number]; popupAnchor: [number, number]; groupSize: number }> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = locationKey(item.latitude, item.longitude)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }

  const placement = new Map<T, { index: number; size: number }>()
  for (const group of groups.values()) {
    group.forEach((item, index) => {
      placement.set(item, { index, size: group.length })
    })
  }

  return items.map((item) => {
    const { index, size } = placement.get(item) ?? { index: 0, size: 1 }
    const iconAnchor = iconAnchorForGroup(index, size)
    return {
      item,
      iconAnchor,
      popupAnchor: popupAnchorForIcon(iconAnchor),
      groupSize: size,
    }
  })
}
