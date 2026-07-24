import { auth } from '../firebase'

let securityNoticeCooldown = false

function showSecurityNoticeToast() {
  if (securityNoticeCooldown) return
  securityNoticeCooldown = true
  setTimeout(() => { securityNoticeCooldown = false }, 2500)

  let existing = document.getElementById('wv-security-shield-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'wv-security-shield-toast'
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    color: #ffffff;
    padding: 12px 18px;
    border-radius: 12px;
    border: 1px solid rgba(99, 102, 241, 0.4);
    box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(99,102,241,0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 92vw;
    width: 480px;
    font-family: system-ui, -apple-system, sans-serif;
    animation: wv-toast-slide-down 0.3s cubic-bezier(0.34,1.56,0.64,1);
  `

  toast.innerHTML = `
    <div style="width: 34px; height: 34px; border-radius: 9px; background: rgba(99,102,241,0.25); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">
      🛡️
    </div>
    <div style="flex: 1;">
      <div style="font-size: 11px; font-weight: 800; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.5px;">
        WALLETVIBE PRO SECURITY SHIELD ACTIVE
      </div>
      <div style="font-size: 10.5px; color: #f87171; font-weight: 700; margin-top: 2px; line-height: 1.4;">
        All code, design, features, and assets are protected under NextLifTechnologies Copyright &amp; Trademark laws. Unauthorized copying or inspection is strictly prohibited.
      </div>
    </div>
  `

  document.body.appendChild(toast)

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0'
      toast.style.transition = 'opacity 0.4s ease'
      setTimeout(() => toast.remove(), 400)
    }
  }, 3500)
}

export function isDevToolsExemptUser() {
  try {
    const email = (auth?.currentUser?.email || '').toLowerCase()
    if (
      email === 'walletpro26@gmail.com' ||
      email.includes('admin') ||
      localStorage.getItem('wv_user_is_admin') === 'true' ||
      localStorage.getItem('wv_dev_mode') === 'true'
    ) {
      return true
    }
  } catch (e) {}
  return false
}

export function initSecurityGuardrails() {
  if (typeof window === 'undefined') return

  // 1. Console Security & Intellectual Property Warning
  console.log(
    '%c 🛡️ WALLETVIBE PRO SECURITY SHIELD ACTIVE %c\n' +
    '%cAll code, design, features, and assets are protected under NextLifTechnologies Copyright & Trademark laws.\n' +
    'Unauthorized copying, reverse-engineering, decompilation, or redistribution is strictly prohibited.',
    'background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; font-size: 14px; font-weight: 800; padding: 6px 12px; border-radius: 6px;',
    '',
    'color: #ef4444; font-size: 11px; font-weight: 700; line-height: 1.5;'
  )

  // 2. Anti-Clickjacking Frame Busting (Prevents embedding in unauthorized iframes)
  try {
    if (window.top !== window.self) {
      window.top.location = window.self.location
    }
  } catch (e) {
    // Cross-origin iframe frame busting block
  }

  // 3. Disable Context Menu (Right-Click) on non-input UI elements
  document.addEventListener('contextmenu', (e) => {
    if (isDevToolsExemptUser()) return
    const targetTag = (e.target.tagName || '').toLowerCase()
    const isEditable = e.target.isContentEditable || ['input', 'textarea', 'select'].includes(targetTag)
    if (!isEditable) {
      e.preventDefault()
      showSecurityNoticeToast()
    }
  }, { capture: true })

  // 4. Disable DevTools & Inspect Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (isDevToolsExemptUser()) return
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

    // F12 (DevTools)
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault()
      e.stopPropagation()
      showSecurityNoticeToast()
      return false
    }

    // Ctrl+Shift+I / Cmd+Option+I (Inspect)
    if (ctrlOrCmd && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
      e.preventDefault()
      e.stopPropagation()
      showSecurityNoticeToast()
      return false
    }

    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if (ctrlOrCmd && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
      e.preventDefault()
      e.stopPropagation()
      showSecurityNoticeToast()
      return false
    }

    // Ctrl+Shift+C / Cmd+Option+C (Inspect Element)
    if (ctrlOrCmd && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
      e.preventDefault()
      e.stopPropagation()
      showSecurityNoticeToast()
      return false
    }

    // Ctrl+U / Cmd+Option+U (View Source)
    if (ctrlOrCmd && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
      e.preventDefault()
      e.stopPropagation()
      showSecurityNoticeToast()
      return false
    }

    // Ctrl+S / Cmd+S (Save Webpage)
    if (ctrlOrCmd && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) {
      const targetTag = (e.target.tagName || '').toLowerCase()
      const isEditable = e.target.isContentEditable || ['input', 'textarea'].includes(targetTag)
      if (!isEditable) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }
  }, { capture: true })

  // 5. Prevent Drag & Drop of App Images & Logos
  document.addEventListener('dragstart', (e) => {
    const tag = (e.target.tagName || '').toLowerCase()
    if (tag === 'img' || tag === 'svg' || e.target.classList.contains('logo')) {
      e.preventDefault()
    }
  }, { capture: true })
}
