import { isMetro, metroAt, metroInfo, type Metro } from '../shared/metros'

const worker = typeof document === 'undefined' ? (globalThis as { name?: unknown }).name : null

export const metro: Metro = isMetro(worker) ? worker : metroAt(globalThis.location?.pathname ?? '/')
export const here = metroInfo[metro]

export const homeOf = (other: Metro, page = '') => `${metroInfo[other].path}/${page}`
