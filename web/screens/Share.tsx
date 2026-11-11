import { useState } from 'react'

export function Share({ path, text, label }: { path: string; text: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!open) {
    return (
      <button type="button" className="share" onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }
  const url = `${location.origin}${path}`
  return (
    <span className="share">
      <a
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        X
      </a>
      <a href={`sms:?&body=${encodeURIComponent(`${text} ${url}`)}`}>Messages</a>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </span>
  )
}
