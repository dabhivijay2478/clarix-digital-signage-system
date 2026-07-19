'use client'

import { useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
  '[onclick]',
  'summary',
].join(',')

type Direction = 'left' | 'up' | 'right' | 'down'

function isEditable(element: Element | null): boolean {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || (element instanceof HTMLElement && element.isContentEditable)
}

function visibleFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && element.getAttribute('aria-hidden') !== 'true'
  })
}

function directionForEvent(event: KeyboardEvent): Direction | null {
  switch (event.keyCode) {
    case 37: return 'left'
    case 38: return 'up'
    case 39: return 'right'
    case 40: return 'down'
    default:
      if (event.key === 'ArrowLeft' || event.key === 'Left') return 'left'
      if (event.key === 'ArrowUp' || event.key === 'Up') return 'up'
      if (event.key === 'ArrowRight' || event.key === 'Right') return 'right'
      if (event.key === 'ArrowDown' || event.key === 'Down') return 'down'
      return null
  }
}

function isActivationEvent(event: KeyboardEvent): boolean {
  return event.keyCode === 13
    || event.key === 'Enter'
    || event.key === 'OK'
    || event.code === 'Enter'
}

function isBackEvent(event: KeyboardEvent): boolean {
  return event.keyCode === 10009
    || event.key === 'Back'
    || event.key === 'XF86Back'
    || event.code === 'BrowserBack'
}

function focusFirstControl(activate = false): boolean {
  const first = visibleFocusableElements()[0]
  if (!first) return false
  first.focus()
  if (activate) first.click()
  return true
}

function focusInDirection(direction: Direction): void {
  const elements = visibleFocusableElements()
  if (elements.length === 0) return

  const active = document.activeElement instanceof HTMLElement && elements.includes(document.activeElement)
    ? document.activeElement
    : null
  if (!active) {
    elements[0].focus()
    return
  }

  const current = active.getBoundingClientRect()
  const currentX = current.left + current.width / 2
  const currentY = current.top + current.height / 2
  let best: { element: HTMLElement; score: number } | null = null

  for (const element of elements) {
    if (element === active) continue
    const rect = element.getBoundingClientRect()
    const deltaX = rect.left + rect.width / 2 - currentX
    const deltaY = rect.top + rect.height / 2 - currentY
    const primary = direction === 'left' ? -deltaX
      : direction === 'right' ? deltaX
        : direction === 'up' ? -deltaY : deltaY
    if (primary <= 0) continue

    const secondary = direction === 'left' || direction === 'right' ? Math.abs(deltaY) : Math.abs(deltaX)
    const score = primary + secondary * 2
    if (!best || score < best.score) best = { element, score }
  }

  if (best) {
    best.element.focus()
    return
  }

  const currentIndex = elements.indexOf(active)
  const delta = direction === 'left' || direction === 'up' ? -1 : 1
  elements[(currentIndex + delta + elements.length) % elements.length].focus()
}

export default function TvRemoteNavigation() {
  useEffect(() => {
    let editingElement: HTMLElement | null = null

    const beginEditing = (element: HTMLElement) => {
      editingElement = element
      element.focus()
    }

    const navigateBack = () => {
      const remoteBackEvent = new CustomEvent('tv-remote-back', { cancelable: true })
      if (!window.dispatchEvent(remoteBackEvent)) return true

      const backControl = document.querySelector<HTMLElement>('[data-tv-back]')
      if (backControl) {
        backControl.click()
        return true
      }
      if (window.history.length > 1) {
        window.history.back()
        return true
      }
      return false
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = directionForEvent(event)
      const active = document.activeElement
      const activeElement = active instanceof HTMLElement ? active : null
      const activeIsEditable = isEditable(active)

      // Once Enter or a pointer opens an editor, Samsung's native IME owns
      // every key until that field loses focus.
      if (event.isComposing || (activeElement && editingElement === activeElement)) return

      if (isActivationEvent(event) && activeElement && activeIsEditable) {
        document.body.classList.add('tv-remote-navigation')
        beginEditing(activeElement)
        return
      }

      if (direction) {
        event.preventDefault()
        document.body.classList.add('tv-remote-navigation')
        focusInDirection(direction)
        return
      }

      if (isActivationEvent(event)) {
        document.body.classList.add('tv-remote-navigation')
        if (active instanceof HTMLElement && typeof active.click === 'function') {
          event.preventDefault()
          active.click()
        } else if (focusFirstControl(true)) {
          event.preventDefault()
        }
        return
      }

      if (isBackEvent(event)) {
        document.body.classList.add('tv-remote-navigation')
        if (navigateBack()) event.preventDefault()
      }
    }

    const handlePointer = (event: Event) => {
      document.body.classList.remove('tv-remote-navigation')
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(FOCUSABLE_SELECTOR) : null
      if (!target) return
      target.focus()
      editingElement = isEditable(target) ? target : null
    }
    const handleFocusOut = (event: FocusEvent) => {
      if (event.target === editingElement) editingElement = null
    }
    const handleHardwareBack = (event: Event) => {
      const hardwareEvent = event as Event & { keyName?: string }
      if (hardwareEvent.keyName !== 'back') return
      document.body.classList.add('tv-remote-navigation')
      if (navigateBack()) event.preventDefault()
    }
    const initialFocusTimer = window.setTimeout(() => {
      if (focusFirstControl()) document.body.classList.add('tv-remote-navigation')
    }, 250)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('mousedown', handlePointer, true)
    window.addEventListener('touchstart', handlePointer, true)
    window.addEventListener('focusout', handleFocusOut, true)
    document.addEventListener('tizenhwkey', handleHardwareBack)
    return () => {
      window.clearTimeout(initialFocusTimer)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('mousedown', handlePointer, true)
      window.removeEventListener('touchstart', handlePointer, true)
      window.removeEventListener('focusout', handleFocusOut, true)
      document.removeEventListener('tizenhwkey', handleHardwareBack)
    }
  }, [])

  return null
}
