import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Global event bus for dialogs
let dialogHandler = null

export function showConfirm({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'primary' | 'success'
  icon = '⚠️',
}) {
  return new Promise((resolve) => {
    if (dialogHandler) {
      dialogHandler({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        variant,
        icon,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      })
    } else {
      // Fallback
      resolve(window.confirm(`${title}\n\n${message}`))
    }
  })
}

export function showAlert({
  title = 'Notice',
  message = '',
  buttonText = 'OK',
  variant = 'primary', // 'primary' | 'success' | 'warning'
  icon = 'ℹ️',
}) {
  return new Promise((resolve) => {
    if (dialogHandler) {
      dialogHandler({
        isOpen: true,
        type: 'alert',
        title,
        message,
        confirmText: buttonText,
        variant,
        icon,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(true),
      })
    } else {
      window.alert(`${title}\n\n${message}`)
      resolve(true)
    }
  })
}

export default function CustomDialogModal() {
  const [state, setState] = useState({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'danger',
    icon: '⚠️',
    onConfirm: null,
    onCancel: null,
  })

  useEffect(() => {
    dialogHandler = (opts) => setState(opts)
    return () => {
      dialogHandler = null
    }
  }, [])

  if (!state.isOpen) return null

  const isDanger = state.variant === 'danger'
  const isSuccess = state.variant === 'success'

  const handleConfirm = () => {
    setState((prev) => ({ ...prev, isOpen: false }))
    state.onConfirm?.()
  }

  const handleCancel = () => {
    setState((prev) => ({ ...prev, isOpen: false }))
    state.onCancel?.()
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 12px',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={handleCancel}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Responsive Centered Modal Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          margin: 'auto',
          background: 'var(--bg-primary, #ffffff)',
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',
          zIndex: 100000000,
          boxSizing: 'border-box',
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            padding: '18px 20px 14px',
            background: isDanger
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : isSuccess
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {state.icon || (isDanger ? '⚠️' : isSuccess ? '🎉' : 'ℹ️')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#ffffff', lineHeight: 1.2, wordBreak: 'break-word' }}>
              {state.title}
            </h3>
          </div>
        </div>

        {/* Message Body */}
        <div
          style={{
            padding: '18px 20px',
            fontSize: 13,
            color: 'var(--text-primary, #334155)',
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {state.message}
        </div>

        {/* Action Footer */}
        <div
          style={{
            padding: '12px 16px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            flexWrap: 'wrap',
            background: 'var(--bg-subtle, #f8fafc)',
            borderTop: '1px solid var(--border-color, #f1f5f9)',
          }}
        >
          {state.type === 'confirm' && (
            <button
              type="button"
              onClick={handleCancel}
              style={{
                flex: '1 1 auto',
                minWidth: 90,
                padding: '9px 16px',
                borderRadius: 10,
                border: '1px solid var(--border-color, #cbd5e1)',
                background: 'var(--bg-card, #ffffff)',
                color: 'var(--text-primary, #475569)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {state.cancelText || 'Cancel'}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            style={{
              flex: '1 1 auto',
              minWidth: 110,
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: isDanger
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : isSuccess
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: isDanger
                ? '0 4px 12px rgba(239, 68, 68, 0.3)'
                : '0 4px 12px rgba(99, 102, 241, 0.3)',
              textAlign: 'center',
            }}
          >
            {state.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
