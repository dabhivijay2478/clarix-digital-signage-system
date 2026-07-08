'use client'

import { useEffect } from 'react'

export default function PlayerThemeLock() {
  useEffect(() => {
    const root = document.documentElement
    const previousClass = root.className
    const previousColorScheme = root.style.colorScheme

    root.classList.remove('dark')
    root.classList.add('light')
    root.style.colorScheme = 'light'

    return () => {
      root.className = previousClass
      root.style.colorScheme = previousColorScheme
    }
  }, [])

  return null
}
