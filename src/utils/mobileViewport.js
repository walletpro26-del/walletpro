export function observeMobileViewport() {
  const viewport = window.visualViewport
  let frame
  const update = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const root = document.documentElement
      root.style.setProperty('--visible-height', `${viewport?.height || window.innerHeight}px`)
      root.style.setProperty('--visible-top', `${viewport?.offsetTop || 0}px`)
    })
  }
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  update()
  return () => {
    cancelAnimationFrame(frame)
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
  }
}
