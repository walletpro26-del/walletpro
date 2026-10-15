import { useEffect, useRef } from 'react'

const stack = []
export default function useToolDialog(onClose) {
  const ref = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    stack.push(dialog)
    dialog.focus({ preventScroll: true })
    const keyboard = event => {
      if (stack.at(-1) !== dialog || event.target.closest?.('.floating-panel')) return
      if (event.key === 'Escape') {
        // Let a field consume Escape to dismiss its suggestions first.
        if (event.defaultPrevented) return
        event.preventDefault(); close.current?.()
      }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(item => item.getClientRects().length)
      const first = items[0], last = items.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('keydown', keyboard)
      stack.splice(stack.indexOf(dialog), 1)
      document.body.style.overflow = overflow
      const restore = previous?.isConnected && previous !== document.body ? previous : document.querySelector('[aria-label="Menu and tools"]')
      restore?.focus({ preventScroll: true })
    }
  }, [])
  return ref
}
