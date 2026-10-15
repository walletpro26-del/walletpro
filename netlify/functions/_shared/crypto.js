import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey() {
  const hexKey = process.env.ENCRYPTION_KEY
  if (!/^[a-fA-F0-9]{64}$/.test(hexKey || '')) throw new Error('ENCRYPTION_KEY must contain exactly 64 hexadecimal characters')
  return Buffer.from(hexKey, 'hex')
}

export function encrypt(text) {
  if (!text) return { ciphertext: '', iv: '', authTag: '' }
  const iv = crypto.randomBytes(12)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag().toString('base64')
  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    authTag,
  }
}

export function decrypt(encryptedData) {
  if (!encryptedData || !encryptedData.ciphertext) return ''
  const { ciphertext, iv, authTag } = encryptedData
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
