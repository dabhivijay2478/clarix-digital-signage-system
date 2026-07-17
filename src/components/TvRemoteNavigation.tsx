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

  if (best) best.element.focus()
}

export default function TvRemoteNavigation() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = directionForEvent(event)
      const active = document.activeElement

      // Samsung IME requires unmodified key events while editing text.
      if (isEditable(active)) return

      if (direction) {
        event.preventDefault()
        document.body.classList.add('tv-remote-navigation')
        focusInDirection(direction)
        return
      }

      if (event.keyCode === 13 || event.key === 'Enter' || event.key === 'OK') {
        if (active instanceof HTMLElement && typeof active.click === 'function') {
          event.preventDefault()
          active.click()
        }
        return
      }

      if (event.keyCode === 10009 || event.key === 'Back') {
        const remoteBackEvent = new CustomEvent('tv-remote-back', { cancelable: true })
        if (!window.dispatchEvent(remoteBackEvent)) {
          event.preventDefault()
          return
        }
        const backControl = document.querySelector<HTMLElement>('[data-tv-back]')
        if (backControl) {
          event.preventDefault()
          backControl.click()
        } else if (window.history.length > 1) {
          event.preventDefault()
          window.history.back()
        }
      }
    }

    const handlePointer = () => document.body.classList.remove('tv-remote-navigation')
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('mousedown', handlePointer, true)
    window.addEventListener('touchstart', handlePointer, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('mousedown', handlePointer, true)
      window.removeEventListener('touchstart', handlePointer, true)
    }
  }, [])

  return null
}
