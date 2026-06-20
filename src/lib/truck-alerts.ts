import type { Truck, TruckScreenAlert, TruckStatus } from './types';

export type TruckStatusField = 'is_waiting' | 'is_loading' | 'is_in' | 'is_out';

export function getTruckStatusInfo(truck: Truck): { status: TruckStatus; status_label: string } {
  if (truck.is_out) return { status: 'out', status_label: 'Gate Out' };
  if (truck.is_in) return { status: 'in', status_label: 'Gate In' };
  if (truck.is_loading) return { status: 'loading', status_label: 'Loading' };
  if (truck.is_waiting) return { status: 'waiting', status_label: 'Waiting' };
  return { status: 'registered', status_label: 'Registered' };
}

export function previewTruckStatusUpdate(truck: Truck, field: TruckStatusField, value: boolean): Truck {
  const time = new Date().toISOString();
  const updated: Truck = { ...truck, [field]: value };

  if (value) {
    if (field === 'is_waiting') updated.waiting_at = time;
    if (field === 'is_loading') updated.loading_at = time;
    if (field === 'is_in') updated.in_at = time;
    if (field === 'is_out') updated.out_at = time;
  } else {
    if (field === 'is_waiting') updated.waiting_at = null;
    if (field === 'is_loading') updated.loading_at = null;
    if (field === 'is_in') updated.in_at = null;
    if (field === 'is_out') updated.out_at = null;
  }

  if (!value) {
    if (field === 'is_waiting') {
      updated.is_loading = false;
      updated.loading_at = null;
      updated.is_in = false;
      updated.in_at = null;
      updated.is_out = false;
      updated.out_at = null;
    } else if (field === 'is_loading') {
      updated.is_in = false;
      updated.in_at = null;
      updated.is_out = false;
      updated.out_at = null;
    } else if (field === 'is_in') {
      updated.is_out = false;
      updated.out_at = null;
    }
  }

  return updated;
}

export function createTruckScreenAlert(truck: Truck, changedAt = new Date().toISOString()): TruckScreenAlert {
  const status = getTruckStatusInfo(truck);
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${truck.id}-${Date.now()}`;

  return {
    id,
    truck_id: truck.id,
    truck_number: truck.registration_number,
    gate: truck.gate_no ?? null,
    status: status.status,
    status_label: status.status_label,
    changed_at: changedAt,
    duration_secs: 3,
  };
}
