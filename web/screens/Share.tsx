import { useEffect, useRef, useState } from 'react'
import { Pixel } from './Pixel'

export function Share({
  path,
  text,
  up,
  className,
}: {
  path: string
  text: string
  up?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const url = `${location.origin}${path}`
  const share = () => {
    if ('share' in navigator && matchMedia('(pointer: coarse)').matches) {
      void navigator.share({ title: 'Agent World', text, url }).catch(() => undefined)
      return
    }
    setCopied(false)
    setOpen(!open)
  }
  return (
    <span className="share" ref={box}>
      <button type="button" className={className} aria-expanded={open} onClick={share}>
        <Pixel name="share" />
        Share
      </button>
      {open && (
        <span className={up ? 'share-menu up' : 'share-menu'}>
          <a
            href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <i className="x">
              <Pixel name="x" />
            </i>
            Post on X
          </a>
          <a
            href={`sms:?&body=${encodeURIComponent(`${text} ${url}`)}`}
            onClick={() => setOpen(false)}
          >
            <i className="messages">
              <Pixel name="talk" />
            </i>
            Message
          </a>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
          >
            <i className="copy">
              <Pixel name={copied ? 'yes' : 'copy'} />
            </i>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </span>
      )}
    </span>
  )
}
