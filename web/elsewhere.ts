import { useEffect } from 'react'
import type { Metro } from '../shared/metros'
import { homeOf, metro } from './metro'

export function useHomeMetro(home: Metro | undefined, page: string) {
  const elsewhere = home !== undefined && home !== metro
  useEffect(() => {
    if (elsewhere) location.replace(`${homeOf(home, page)}${location.search}`)
  }, [elsewhere, home, page])
  return elsewhere
}
