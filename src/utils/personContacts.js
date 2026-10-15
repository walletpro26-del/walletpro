const keyFor = person => String(person || '').trim().replace(/\s+/g, ' ').toLowerCase()
const timestamp = value => value?.toDate ? value.toDate().getTime() : (new Date(value).getTime() || 0)

export function buildPersonContactMap(records = []) {
  const map = Object.create(null)
  const edited = new Map()
  if (!Array.isArray(records)) return map
  const chronological = [...records].sort((a, b) => timestamp(a.date) - timestamp(b.date))
  for (const record of chronological) {
    const key = keyFor(record.person)
    if (!key) continue
    if (!map[key]) map[key] = { mobileNo: '', email: '' }
    if (record.mobileNo || record.phone) map[key].mobileNo = record.mobileNo || record.phone
    if (record.email) map[key].email = record.email
    if (record.contactEdited) {
      const previous = edited.get(key)
      if (!previous || timestamp(record.contactUpdatedAt || record.date) >= timestamp(previous.contactUpdatedAt || previous.date)) edited.set(key, record)
    }
  }
  // A correction to an older transaction is still the newest contact edit.
  // Explicitly cleared fields stay empty instead of reviving stale contacts.
  for (const [key, record] of edited) map[key] = { mobileNo: record.mobileNo || '', email: record.email || '' }
  return map
}

export function getLendingRemarkSuggestions(records = [], person = '', type = '') {
  const groups = new Map()
  for (const record of records) {
    const text = String(record.remarks || record.details || '').trim()
    if (!text) continue
    const key = text.toLowerCase()
    const samePerson = !!keyFor(person) && keyFor(record.person) === keyFor(person)
    const sameType = keyFor(record.type || record.lendType) === keyFor(type)
    const priority = (samePerson ? 2 : 0) + (sameType ? 1 : 0)
    const date = timestamp(record.date)
    const item = groups.get(key)
    if (!item) groups.set(key, {text, priority, date, count:1})
    else { item.count++; item.priority = Math.max(item.priority, priority); if (date > item.date) {item.date = date; item.text = text} }
  }
  return [...groups.values()].sort((a,b) => b.priority - a.priority || b.count - a.count || b.date - a.date).slice(0, 20).map(item => item.text)
}
