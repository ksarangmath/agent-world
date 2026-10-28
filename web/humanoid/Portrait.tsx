import { useEffect, useRef } from 'react'
import { portrait, portraitSize } from '../../shared/portrait'
import type { Avatar } from '../../shared/profile'

export function Portrait({ avatar, className }: { avatar: Avatar; className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const image = new ImageData(portrait(avatar), portraitSize, portraitSize)
    canvas.current!.getContext('2d')!.putImageData(image, 0, 0)
  }, [avatar])
  return (
    <canvas
      ref={canvas}
      className={className}
      width={portraitSize}
      height={portraitSize}
      aria-hidden
    />
  )
}
