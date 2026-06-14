'use client'

import { toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export function showToast(message: string, type: ToastType = 'info') {
  toast[type](message)
}

export default function ToastContainer() {
  return null
}
