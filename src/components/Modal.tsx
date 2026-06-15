'use client'

import { useId } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export default function Modal({ isOpen, onClose, title, children, actions }: ModalProps) {
  const descriptionId = useId()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={descriptionId} className="max-h-[92vh] overflow-hidden border-border/70 bg-card/95 p-0 shadow-2xl shadow-black/50 backdrop-blur-xl sm:max-w-xl">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
          <DialogDescription id={descriptionId} className="sr-only">{title} dialog</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {actions && <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">{actions}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
