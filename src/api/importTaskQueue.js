/**
 * importTaskQueue.js
 * Manages background PDF parsing, draft persistence, and bulk import operations
 * so tasks and database writes continue seamlessly even if the user closes modal dialogs or switches tabs.
 */

import { parsePdfWithGemini } from './pdfExtractor'

class ImportTaskQueue {
  constructor() {
    this.activeTask = null // { id, type: 'parse'|'commit', filename, mode, status, percent, items, count, error, isComplete }
    this.listeners = new Set()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    // emit current state immediately
    listener(this.activeTask)
    return () => this.listeners.delete(listener)
  }

  notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.activeTask)
      } catch (err) {
        // quiet catch
      }
    })
  }

  getActiveTask() {
    return this.activeTask
  }

  clearActiveTask() {
    this.activeTask = null
    this.notify()
  }

  // Draft Persistence for Extracted Previews
  saveDraftPreview(mode, previewData) {
    try {
      if (!previewData || !previewData.items || previewData.items.length === 0) {
        localStorage.removeItem(`wv_draft_preview_${mode}`)
        return
      }
      localStorage.setItem(`wv_draft_preview_${mode}`, JSON.stringify({
        ...previewData,
        savedAt: Date.now(),
      }))
    } catch (e) {
      // quiet fallback
    }
  }

  getDraftPreview(mode) {
    try {
      const raw = localStorage.getItem(`wv_draft_preview_${mode}`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // Expire draft after 48 hours
      if (Date.now() - (parsed.savedAt || 0) > 48 * 60 * 60 * 1000) {
        localStorage.removeItem(`wv_draft_preview_${mode}`)
        return null
      }
      return parsed
    } catch (e) {
      return null
    }
  }

  clearDraftPreview(mode) {
    try {
      localStorage.removeItem(`wv_draft_preview_${mode}`)
    } catch (e) {}
  }

  /**
   * Start a background PDF AI parsing task
   */
  startPdfParsingTask({ file, mode, isAdmin = false, onComplete = null }) {
    const taskId = 'task_pdf_' + Date.now()
    this.activeTask = {
      id: taskId,
      type: 'parse',
      filename: file.name,
      mode,
      status: 'Step 1/3: Validating & encoding PDF document...',
      percent: 15,
      items: null,
      error: null,
      isComplete: false,
    }
    this.notify()

    // Execute in background
    parsePdfWithGemini(
      file,
      mode,
      (statusText, progressPercent) => {
        if (this.activeTask && this.activeTask.id === taskId) {
          this.activeTask.status = statusText
          this.activeTask.percent = progressPercent
          this.notify()
        }
      },
      isAdmin
    )
      .then((extractedItems) => {
        if (this.activeTask && this.activeTask.id === taskId) {
          this.activeTask.items = extractedItems
          this.activeTask.status = '✔ AI Extraction Completed!'
          this.activeTask.percent = 100
          this.activeTask.isComplete = true
          this.notify()
          onComplete?.(extractedItems)
        }
      })
      .catch((err) => {
        if (this.activeTask && this.activeTask.id === taskId) {
          this.activeTask.error = err?.message || 'Failed to extract PDF data.'
          this.activeTask.status = '❌ Extraction Failed'
          this.activeTask.percent = 0
          this.activeTask.isComplete = true
          this.notify()
        }
      })

    return taskId
  }

  /**
   * Start a background Bulk Database Commit task
   */
  startBatchCommitTask({ mode, count, commitFn, onComplete = null }) {
    const taskId = 'task_commit_' + Date.now()
    this.activeTask = {
      id: taskId,
      type: 'commit',
      filename: `Importing ${count} items`,
      mode,
      status: `Saving ${count} transactions to database...`,
      percent: 30,
      count,
      error: null,
      isComplete: false,
    }
    this.notify()

    Promise.resolve()
      .then(() => commitFn((progressPercent, statusText) => {
        if (this.activeTask && this.activeTask.id === taskId) {
          this.activeTask.percent = progressPercent
          if (statusText) this.activeTask.status = statusText
          this.notify()
        }
      }))
      .then((res) => {
        if (this.activeTask && this.activeTask.id === taskId) {
          this.activeTask.status = `✔ Successfully saved ${count} transactions!`
          this.activeTask.percent = 100
          this.activeTask.isComplete = true
          this.notify()
          this.clearDraftPreview(mode)
          onComplete?.(res)
        }
      })
      .catch((err) => {
        if (this.activeTask && this.activeTask.id === taskId) {
          this.activeTask.error = err?.message || 'Failed to save transactions.'
          this.activeTask.status = '❌ Database Write Failed'
          this.activeTask.percent = 0
          this.activeTask.isComplete = true
          this.notify()
        }
      })

    return taskId
  }
}

export const importTaskQueue = new ImportTaskQueue()
