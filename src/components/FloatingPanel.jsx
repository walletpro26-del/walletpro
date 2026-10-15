import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Use the visible viewport: the layout viewport may extend behind a phone keyboard.
export default function FloatingPanel({ open, anchorRef, onDismiss, children, className = '', minWidth = 240, maxHeight = 300, align = 'start', ...props }) {
  const panel = useRef(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const [position, setPosition] = useState(null)
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    let frame
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!anchorRef.current || !panel.current) return
        let rect = anchorRef.current.getBoundingClientRect()
        const viewport = window.visualViewport
        const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0
        const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight
        if (anchorRef.current.contains(document.activeElement) && height < window.innerHeight - 100 && (rect.bottom > top + height - 60 || rect.top < top + 8)) {
          const delta = rect.bottom > top + height - 60 ? rect.bottom - (top + height - 100) : rect.top - top - 12
          let parent = anchorRef.current.parentElement
          while (parent && !(parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement
          if (parent) parent.scrollTop += delta
          else window.scrollBy(0, delta)
          rect = anchorRef.current.getBoundingClientRect()
        }
        const panelWidth = Math.min(Math.max(rect.width, minWidth), width - 16)
        const below = top + height - rect.bottom - 14, above = rect.top - top - 14
        const upward = below < Math.min(maxHeight, 180) && above > below
        const available = Math.max(48, Math.min(maxHeight, upward ? above : below, height - 16))
        const panelHeight = Math.min(panel.current.scrollHeight, available)
        const x = align === 'end' ? rect.right - panelWidth : rect.left
        const next = {
          left: Math.max(left + 8, Math.min(x, left + width - panelWidth - 8)),
          top: Math.max(top + 8, Math.min(upward ? rect.top - panelHeight - 6 : rect.bottom + 6, top + height - panelHeight - 8)),
          width: panelWidth, maxHeight: available,
        }
        setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      })
    }
    const inside = target => anchorRef.current?.contains(target) || panel.current?.contains(target)
    const outside = event => { if (!inside(event.target)) dismiss.current?.() }
    const keyboard = event => {
      if (event.key === 'Escape' && inside(event.target)) { event.preventDefault(); event.stopPropagation(); dismiss.current?.() }
    }
    const observer = new ResizeObserver(update)
    observer.observe(anchorRef.current)
    observer.observe(panel.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', keyboard)
    update()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', keyboard)
    }
  }, [open, anchorRef, minWidth, maxHeight, align])
  return open ? createPortal(<div ref={panel} {...props} className={`floating-panel ${className}`} style={{ position: 'fixed', zIndex: 2147483000, ...position, visibility: position ? 'visible' : 'hidden' }}>{children}</div>, document.body) : null
}
