import { useEffect, useSyncExternalStore } from 'react'

type Voice = [
  wave: OscillatorType | 'noise',
  spread: number,
  attack: number,
  ring: number,
  sustain: number,
  release: number,
  bright: number,
  dull: number,
  vibrato: number,
  level: number,
]

const voices = {
  guitar: ['sawtooth', 0, 0.004, 1.6, 0.01, 0.1, 10, 3, 0, 0.16],
  kalimba: ['triangle', 0, 0.003, 1.2, 0.01, 0.1, 8, 3, 0, 0.22],
  flute: ['sawtooth', 0, 0.08, 0, 0.8, 0.14, 3.5, 2.2, 9, 0.14],
  pad: ['sawtooth', 6, 1, 0, 1, 1.5, 2.5, 2.5, 0, 0.022],
  bass: ['sawtooth', 0, 0.02, 0, 0.5, 0.2, 4, 2, 0, 0.085],
  shaker: ['noise', 0, 0.012, 0.07, 0.05, 0.04, 12, 12, 0, 0.09],
} satisfies Record<string, Voice>

type Half = [chords: string, tune: string]

const themes = {
  I: [
    '0.7.9.b.',
    ['GCGC', '........ ........ ........ ........'],
    ['GCGD', '....B-d- g-----.. ....d-B- A-----..'],
    ['eCDD', 'B--GB-d- e-----.. d--ef-e- d-----..'],
  ],
  A: [
    '079beb97',
    ['GCGD', 'd--Bd-e- g---e--. d--Bd-B- A-----..'],
    ['eCGD', 'B--GB-d- e---g--. b--ag-e- d-----..'],
    ['eCDG', 'B--GB-d- e--dc-e- a--gf-e- d-B-G--.'],
  ],
  B: [
    '07974797',
    ['CGDe', 'g---e-g- d-----B- A-d-f-d- e-----..'],
    ['CGaD', 'g---e-g- b-----g- a-g-e-c- d-----..'],
    ['CDGG', 'g---e-g- a---f-a- b--ag-a- g-----..'],
  ],
  C: [
    '0.79.b9.',
    ['ebCG', 'E--GB-A- F---D--. E--Gc-B- d-----..'],
    ['ebCD', 'e--dB-G- F---B--. c--BG-E- F-----..'],
    ['aDGG', 'e--dc-A- F---A-d- B--AB-A- G-----..'],
  ],
  K: [
    '0.7.9.b.',
    ['GGCC', 'd--Bd-e- d-----.. e--ce-g- e-----..'],
    ['eeCD', 'B--GB-d- B-----.. c--eg-e- d-----..'],
    ['eCDG', 'B--GB-d- e--dc-e- d--ef-a- g-----..'],
  ],
} satisfies Record<string, [guitar: string, head: Half, open: Half, close: Half]>

const arrangement = {
  theme: 'I AaAa BbBb AaAa KkK CcCc BbBb AaAa Kk Aa i',
  flute: '. xxxx xxxx ..xx ... xxxx xxxx xxxx .. xx .',
  kalimba: 'x .... ..xx xx.x xxx .... ..xx ..xx xx .. x',
  passing: '0 0011 0011 0112 001 0011 1122 1222 01 01 0',
  bass: '. .xxx xxxx ..xx ... .xxx xxxx xxxx .. .x .',
  pad: 'x xxxx xxxx .xxx xxx xxxx xxxx xxxx xx .x x',
  shaker: '. ..xx xxxx ...x ... ..xx xxxx .xxx .. .. .',
}

const step = 30 / 88
const phraseSteps = 64
const leadIn = 0.1
const humanize = 0.012

const compact = (text: string) => text.replaceAll(' ', '')

export const songSeconds = compact(arrangement.theme).length * phraseSteps * step

export type Note = {
  voice: keyof typeof voices
  time: number
  degree: number
  length: number
  gain: number
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function row(text: string) {
  const struck: { at: number; length: number; symbol: string }[] = []
  for (const [at, symbol] of [...compact(text)].entries()) {
    if (symbol === '-') struck.at(-1)!.length++
    else if (symbol !== '.') struck.push({ at, length: 1, symbol })
  }
  return struck
}

function compose() {
  const random = seeded(88)
  const song: Note[] = []
  const add = (voice: Note['voice'], at: number, degree: number, length: number, gain: number) =>
    song.push({
      voice,
      degree,
      time: leadIn + at * step + random() * humanize,
      length: length * step,
      gain: gain * (0.85 + 0.3 * random()),
    })
  for (const [phrase, letter] of [...compact(arrangement.theme)].entries()) {
    const part = (name: keyof typeof arrangement) => compact(arrangement[name])[phrase]
    const closed = letter !== letter.toUpperCase()
    const [guitar, head, open, close] = themes[letter.toUpperCase() as keyof typeof themes]
    const tail = closed ? close : open
    const start = phrase * phraseSteps
    for (const [bar, chord] of [...(head[0] + tail[0])].entries()) {
      const at = start + bar * 8
      const root = (('GABCDEF'.indexOf(chord.toUpperCase()) + 2) % 7) - 16
      for (const pluck of row(guitar))
        add('guitar', at + pluck.at, root + parseInt(pluck.symbol, 36), 1, pluck.at ? 0.75 : 1)
      if (part('bass') === 'x') {
        add('bass', at, root, 3.5, 1)
        add('bass', at + 4, root + (root > -14 ? -3 : 4), 3, 0.8)
      }
      if (part('pad') === 'x') for (const tone of [7, 9, 11]) add('pad', at, root + tone, 8, 1)
      if (part('shaker') === 'x')
        for (let beat = 0; beat < 8; beat++)
          add('shaker', at + beat, 0, 1, beat % 4 === 2 ? 1 : 0.45)
    }
    const flute = part('flute') === 'x'
    const kalimba = part('kalimba') === 'x'
    const sing = (at: number, degree: number, length: number) => {
      const accent = at % 4 ? 0.8 : 1
      if (flute) add('flute', start + at, degree, length - 0.3, accent)
      if (kalimba)
        add('kalimba', start + at, degree + (flute ? 7 : 0), length, accent * (flute ? 0.5 : 1))
    }
    const tune = row(head[1] + tail[1]).map((note) => ({
      ...note,
      degree: 'CDEFGABcdefgab'.indexOf(note.symbol) - 4,
    }))
    for (const [index, { at, length, degree }] of tune.entries()) {
      const next = tune[index + 1]
      const leap = next?.at === at + length ? next.degree - degree : 0
      const passing =
        length > 1 && Math.abs(leap) === 2 && random() < Number(part('passing')) * 0.35
      sing(at, degree, passing ? length - 1 : length)
      if (passing) sing(at + length - 1, degree + leap / 2, 1)
    }
  }
  return song
}

const song = compose()

export function notes(from: number, to: number) {
  const found: Note[] = []
  for (let lap = Math.floor(from / songSeconds); lap * songSeconds < to; lap++)
    for (const note of song) {
      const time = note.time + lap * songSeconds
      if (time >= from && time < to) found.push({ ...note, time })
    }
  return found
}

function noise(context: BaseAudioContext, seconds: number, decay: number) {
  const random = seeded(1)
  const buffer = context.createBuffer(2, seconds * context.sampleRate, context.sampleRate)
  for (const channel of [0, 1]) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < samples.length; i++)
      samples[i] = (random() * 2 - 1) * Math.exp(-i / context.sampleRate / decay)
  }
  return buffer
}

export function mixer<Context extends BaseAudioContext>(context: Context) {
  const bus = new GainNode(context, { gain: 0.4 })
  const send = new BiquadFilterNode(context, { type: 'bandpass', frequency: 1200, Q: 0.4 })
  const reverb = new ConvolverNode(context, { buffer: noise(context, 1.5, 0.25) })
  const wet = new GainNode(context, { gain: 0.8 })
  const tone = new BiquadFilterNode(context, { type: 'lowpass', frequency: 8000 })
  const limiter = new DynamicsCompressorNode(context, {
    threshold: -14,
    knee: 4,
    ratio: 20,
    attack: 0.003,
    release: 0.25,
  })
  const fade = new GainNode(context)
  bus.connect(tone).connect(limiter).connect(fade).connect(context.destination)
  bus.connect(send).connect(reverb).connect(wet).connect(tone)
  return { context, bus, fade, hiss: noise(context, 0.2, Infinity) }
}

const sweep = 0.25

export function play({ context, bus, hiss }: ReturnType<typeof mixer>, due: Note[]) {
  for (const { voice, time, degree, length, gain } of due) {
    const [wave, spread, attack, ring, sustain, release, bright, dull, vibrato, level] =
      voices[voice]
    const semitones = Math.floor((degree * 12 + 5) / 7)
    const hertz = 392 * 2 ** (semitones / 12)
    const hold = time + Math.max(ring || length, attack + 0.01)
    const end = hold + release
    const filter = new BiquadFilterNode(context, {
      type: wave === 'noise' ? 'highpass' : 'lowpass',
    })
    filter.frequency.setValueAtTime(hertz * bright, time)
    filter.frequency.exponentialRampToValueAtTime(hertz * dull, time + sweep)
    const envelope = new GainNode(context, { gain: 0 })
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(gain * level, time + attack)
    envelope.gain.exponentialRampToValueAtTime(gain * level * sustain, hold)
    envelope.gain.linearRampToValueAtTime(0, end)
    filter.connect(envelope).connect(bus)
    const sources =
      wave === 'noise'
        ? [new AudioBufferSourceNode(context, { buffer: hiss })]
        : (spread ? [-spread, spread] : [0]).map(
            (detune) => new OscillatorNode(context, { type: wave, frequency: hertz, detune }),
          )
    for (const source of sources) {
      source.connect(filter)
      source.start(time)
      source.stop(end)
      source.onended = () => envelope.disconnect()
      if (!vibrato) continue
      const wobble = new OscillatorNode(context, { frequency: 5 })
      const depth = new GainNode(context, { gain: 0 })
      depth.gain.setValueAtTime(0, time + 0.15)
      depth.gain.linearRampToValueAtTime(vibrato, time + 0.6)
      wobble.connect(depth).connect(source.detune)
      wobble.start(time)
      wobble.stop(end)
    }
  }
}

const lookahead = 0.5
const listeners = new Set<() => void>()
function remembered() {
  try {
    return localStorage.getItem('music')
  } catch {
    return null
  }
}

let muted = remembered() === 'off'
let live: ReturnType<typeof mixer<AudioContext>> | undefined
let sounding = false
let mounted = false
let cursor = 0
let pump = 0
let pause = 0

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function sync() {
  if (!live) return
  const band = live
  const on = mounted && !muted && !document.hidden
  if (on) void band.context.resume()
  if (on === sounding) return
  sounding = on
  band.fade.gain.setTargetAtTime(on ? 1 : 0, band.context.currentTime, on ? 0.7 : 0.08)
  clearTimeout(pause)
  clearInterval(pump)
  if (!on) {
    pause = setTimeout(() => void band.context.suspend(), 400)
    return
  }
  const schedule = () => {
    const now = band.context.currentTime
    play(band, notes(Math.max(cursor, now), now + lookahead))
    cursor = now + lookahead
  }
  schedule()
  pump = setInterval(schedule, 100)
}

function wake() {
  if (mounted && !muted && !live) {
    live = mixer(new AudioContext({ latencyHint: 'playback' }))
    live.fade.gain.value = 0
  }
  sync()
}

function toggle() {
  muted = !muted
  try {
    localStorage.setItem('music', muted ? 'off' : 'on')
  } catch {
    return
  } finally {
    for (const listener of listeners) listener()
    wake()
  }
}

const gestures = ['pointerdown', 'pointerup', 'keydown']

export function useMusic() {
  useEffect(() => {
    mounted = true
    for (const gesture of gestures) addEventListener(gesture, wake)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      mounted = false
      for (const gesture of gestures) removeEventListener(gesture, wake)
      document.removeEventListener('visibilitychange', sync)
      sync()
    }
  }, [])
  return { muted: useSyncExternalStore(subscribe, () => muted), toggle }
}
