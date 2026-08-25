/** Status model - mirrors the database enums (migration 0003) and the
 * colour/icon groups in Architecture section 14. The database is the source
 * of truth; this file only maps codes to presentation. */

export type ContainerStatus =
  | 'NEW' | 'IN_STOCK' | 'FILLED' | 'WITH_CUSTOMER' | 'RETURN_REQUESTED'
  | 'IN_TRANSIT' | 'AWAITING_WASH' | 'AWAITING_INSPECTION' | 'QUARANTINED'
  | 'LOST' | 'RETIRED' | 'SENT_FOR_RECYCLING' | 'RECYCLED' | 'VOID'

type Group = 'ready' | 'out' | 'processing' | 'problem' | 'eol' | 'neutral'

export const STATUS_META: Record<ContainerStatus, { label: string; group: Group; icon: string }> = {
  NEW:                 { label: 'New',                 group: 'neutral',    icon: 'plus-circle' },
  IN_STOCK:            { label: 'In stock',            group: 'ready',      icon: 'check-circle' },
  FILLED:              { label: 'Filled',              group: 'ready',      icon: 'check-circle' },
  WITH_CUSTOMER:       { label: 'With customer',       group: 'out',        icon: 'truck' },
  RETURN_REQUESTED:    { label: 'Return requested',    group: 'out',        icon: 'truck' },
  IN_TRANSIT:          { label: 'In transit',          group: 'out',        icon: 'truck' },
  AWAITING_WASH:       { label: 'Awaiting wash',       group: 'processing', icon: 'refresh' },
  AWAITING_INSPECTION: { label: 'Awaiting inspection', group: 'processing', icon: 'refresh' },
  QUARANTINED:         { label: 'Quarantined',         group: 'problem',    icon: 'shield-alert' },
  LOST:                { label: 'Lost',                group: 'problem',    icon: 'shield-alert' },
  RETIRED:             { label: 'Retired',             group: 'eol',        icon: 'archive' },
  SENT_FOR_RECYCLING:  { label: 'Sent for recycling',  group: 'eol',        icon: 'archive' },
  RECYCLED:            { label: 'Recycled',            group: 'eol',        icon: 'archive' },
  VOID:                { label: 'Void',                group: 'eol',        icon: 'archive' },
}

/** ISO 59004 value-retention vocabulary (Architecture 9.2, 10.6) - used on
 * reports and customer-facing screens; staff screens keep operational words. */
export const VALUE_RETENTION: Record<string, 'reuse' | 'recycling' | 'remanufacture'> = {
  WASHED: 'reuse', INSPECTED: 'reuse', FILLED: 'reuse', DISPATCHED: 'reuse', RETURNED: 'reuse',
  SENT_FOR_RECYCLING: 'recycling', RECYCLED: 'recycling',
}
