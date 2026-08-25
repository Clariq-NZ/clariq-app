/** The four location levels are fixed columns (faculty, building, room,
 * cabinet). What they are called depends on the customer's industry, so each
 * customer carries its own labels, seeded from a preset and editable. */
export type LocationLabels = { preset: string; faculty: string; building: string; room: string; cabinet: string }
export const LEVELS = ['faculty', 'building', 'room', 'cabinet'] as const

export const PRESETS: Record<string, Omit<LocationLabels, 'preset'> & { name: string }> = {
  UNIVERSITY:    { name: 'University or research', faculty: 'Faculty', building: 'Building', room: 'Room / Lab', cabinet: 'Cabinet' },
  HOSPITAL:      { name: 'Hospital or health', faculty: 'Division', building: 'Building', room: 'Ward / Department', cabinet: 'Store / Cupboard' },
  MANUFACTURING: { name: 'Manufacturing or processing', faculty: 'Plant', building: 'Area / Line', room: 'Bay / Station', cabinet: 'Cabinet / Rack' },
  COUNCIL:       { name: 'Council or utility', faculty: 'Department', building: 'Depot / Facility', room: 'Store / Shed', cabinet: 'Bay / Shelf' },
  AGRICULTURE:   { name: 'Agriculture or horticulture', faculty: 'Property', building: 'Block / Shed', room: 'Chemical store', cabinet: 'Shelf / Pallet' },
  MINING:        { name: 'Mining or energy', faculty: 'Site', building: 'Area / Plant', room: 'Store / Magazine', cabinet: 'Cabinet / Bund' },
  DISTRIBUTION:  { name: 'Distribution or warehouse', faculty: 'Region', building: 'Warehouse', room: 'Zone / Aisle', cabinet: 'Rack / Bin' },
  GENERIC:       { name: 'Other', faculty: 'Division', building: 'Building', room: 'Room / Area', cabinet: 'Storage unit' },
}

export function labelsFor(raw: unknown): LocationLabels {
  const base = PRESETS.UNIVERSITY
  const r = (raw ?? {}) as Partial<LocationLabels>
  return { preset: r.preset ?? 'UNIVERSITY', faculty: r.faculty ?? base.faculty, building: r.building ?? base.building, room: r.room ?? base.room, cabinet: r.cabinet ?? base.cabinet }
}
