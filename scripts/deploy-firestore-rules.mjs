#!/usr/bin/env node
/**
 * scripts/deploy-firestore-rules.mjs
 *
 * Automated deployment of Firestore Security Rules (firestore.rules)
 * to Firebase project 'walletpro-aa1f3'.
 *
 * Supports multiple deployment strategies:
 * 1. Google Cloud REST API (using FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS)
 * 2. Firebase CLI via FIREBASE_TOKEN environment variable
 * 3. Firebase CLI via active local login session (npx firebase deploy)
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'walletpro-aa1f3'
const RULES_PATH = path.join(PROJECT_ROOT, 'firestore.rules')

function log(msg) {
  console.log(`[rules-deploy] ${msg}`)
}

function warn(msg) {
  console.warn(`[rules-deploy] ⚠️  ${msg}`)
}

function error(msg) {
  console.error(`[rules-deploy] ❌ ${msg}`)
}

/**
 * Base64 URL encode utility
 */
function base64UrlEncode(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Find Service Account Credentials if available
 */
function findServiceAccount() {
  // 1. From environment variable (raw JSON string or file path)
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (envVal) {
    if (envVal.trim().startsWith('{')) {
      try {
        return JSON.parse(envVal)
      } catch (e) {
        warn('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ' + e.message)
      }
    } else if (fs.existsSync(envVal)) {
      try {
        return JSON.parse(fs.readFileSync(envVal, 'utf-8'))
      } catch (e) {
        warn(`Failed to read credentials file at ${envVal}: ` + e.message)
      }
    }
  }

  // 2. Local files (common service account names, ignored in git)
  const candidates = [
    path.join(PROJECT_ROOT, 'service-account.json'),
    path.join(PROJECT_ROOT, 'firebase-adminsdk.json'),
    path.join(PROJECT_ROOT, `${PROJECT_ID}-adminsdk.json`),
  ]

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        log(`Found local service account at ${path.basename(c)}`)
        return JSON.parse(fs.readFileSync(c, 'utf-8'))
      } catch {}
    }
  }

  return null
}

/**
 * Deploy using Google Cloud Rules API and Service Account
 */
async function deployViaGoogleCloudApi(sa, rulesContent) {
  log('Authenticating with Google Cloud via Service Account...')
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(sa.private_key)
  const jwt = `${unsignedToken}.${base64UrlEncode(signature)}`

  // Request OAuth access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    throw new Error(`Google OAuth token request failed (${tokenRes.status}): ${errText}`)
  }

  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token

  log('Creating new Firestore ruleset in Google Cloud...')
  const createRulesetRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: {
          files: [
            {
              name: 'firestore.rules',
              content: rulesContent,
            },
          ],
        },
      }),
    }
  )

  if (!createRulesetRes.ok) {
    const errText = await createRulesetRes.text()
    throw new Error(`Ruleset creation failed (${createRulesetRes.status}): ${errText}`)
  }

  const rulesetData = await createRulesetRes.json()
  const rulesetName = rulesetData.name // projects/{projectId}/rulesets/{rulesetId}
  log(`Created ruleset: ${rulesetName}`)

  log('Releasing ruleset to live Cloud Firestore...')
  const releaseRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        release: {
          name: `projects/${PROJECT_ID}/releases/cloud.firestore`,
          rulesetName,
        },
      }),
    }
  )

  if (!releaseRes.ok) {
    const errText = await releaseRes.text()
    throw new Error(`Release failed (${releaseRes.status}): ${errText}`)
  }

  log(`✅ Firestore security rules successfully deployed & activated on project: ${PROJECT_ID}!`)
  return true
}

/**
 * Deploy using Firebase CLI
 */
function deployViaCli() {
  const token = process.env.FIREBASE_TOKEN
  const tokenFlag = token ? `--token "${token}"` : ''
  const cmd = `npx --yes firebase-tools deploy --only firestore:rules --project ${PROJECT_ID} ${tokenFlag}`.trim()

  log(`Running: npx firebase deploy --only firestore:rules --project ${PROJECT_ID}`)
  execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'inherit' })
  log(`✅ Firestore security rules successfully deployed via Firebase CLI!`)
  return true
}

async function main() {
  log(`Starting Firestore Rules automated update check...`)

  if (!fs.existsSync(RULES_PATH)) {
    error(`Rules file not found at: ${RULES_PATH}`)
    process.exit(1)
  }

  const rulesContent = fs.readFileSync(RULES_PATH, 'utf-8')
  log(`Loaded firestore.rules (${rulesContent.length} bytes)`)

  // Strategy 1: Check for Service Account
  const sa = findServiceAccount()
  if (sa && sa.private_key && sa.client_email) {
    try {
      await deployViaGoogleCloudApi(sa, rulesContent)
      return
    } catch (e) {
      warn(`Service account deployment failed: ${e.message}`)
      log('Attempting Firebase CLI fallback...')
    }
  }

  // Strategy 2: Firebase CLI
  try {
    deployViaCli()
    return
  } catch (e) {
    warn(`Firebase CLI deployment failed: ${e.message}`)
  }

  // If in CI or Netlify, do not fail build unless STRICT_RULES_DEPLOY is set
  const isCI = process.env.CI || process.env.NETLIFY || process.env.GITHUB_ACTIONS
  if (isCI && !process.env.STRICT_RULES_DEPLOY) {
    warn(
      'Automated rules deploy skipped: No authorized credentials found in build environment.\n' +
      'To enable automatic rules updates on every deploy, add FIREBASE_TOKEN or FIREBASE_SERVICE_ACCOUNT to your environment variables.'
    )
    process.exit(0)
  } else {
    error(
      'Could not deploy rules automatically. Please either:\n' +
      '  1. Log in to the correct Firebase account: npx firebase login\n' +
      '  2. Set FIREBASE_TOKEN or FIREBASE_SERVICE_ACCOUNT environment variable.\n' +
      '  3. Or run the GitHub Actions workflow once pushed to main.'
    )
    process.exit(1)
  }
}

main().catch((err) => {
  error('Fatal error during rules deployment: ' + (err?.stack || err?.message || err))
  process.exit(1)
})
