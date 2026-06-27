import type { Truck, TruckScreenAlert, TruckStatus } from './types';

export type TruckStatusField = 'is_waiting' | 'is_loading' | 'is_in' | 'is_out';

export function getTruckStatusInfo(truck: Truck): { status: TruckStatus; status_label: string } {
  if (truck.is_out) return { status: 'out', status_label: 'Loading Out.' };
  if (truck.is_loading || truck.is_in) return { status: 'loading', status_label: 'Loading in.' };
  if (truck.is_waiting) return { status: 'waiting', status_label: 'Waiting' };
  return { status: 'registered', status_label: 'Registered' };
}

export function previewTruckStatusUpdate(truck: Truck, field: TruckStatusField, value: boolean): Truck {
  const time = new Date().toISOString();
  const updated: Truck = { ...truck, [field]: value };

  if (field === 'is_loading') {
    updated.is_in = value;
  } else if (field === 'is_in') {
    updated.is_loading = value;
  }

  if (value) {
    if (field === 'is_waiting') updated.waiting_at = time;
    if (field === 'is_loading' || field === 'is_in') {
      updated.loading_at = time;
      updated.in_at = time;
    }
    if (field === 'is_out') updated.out_at = time;
  } else {
    if (field === 'is_waiting') updated.waiting_at = null;
    if (field === 'is_loading' || field === 'is_in') {
      updated.loading_at = null;
      updated.in_at = null;
    }
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
    } else if (field === 'is_loading' || field === 'is_in') {
      updated.is_loading = false;
      updated.loading_at = null;
      updated.is_in = false;
      updated.in_at = null;
      updated.is_out = false;
      updated.out_at = null;
    }
  }

  return updated;
}

export function createTruckScreenAlert(truck: Truck, changedAt = new Date().toISOString()): TruckScreenAlert {
  const status = getTruckStatusInfo(truck);
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      });

  return {
    id,
    truck_id: truck.id,
    truck_number: truck.registration_number,
    gate: truck.gate_no ?? null,
    status: status.status,
    status_label: status.status_label,
    changed_at: changedAt,
    duration_secs: 30,
  };
}
