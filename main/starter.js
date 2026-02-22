const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const bold = '\x1b[1m'
const green = '\x1b[32m'
const red = '\x1b[31m'
const yellow = '\x1b[33m'
const reset = '\x1b[0m'

// Each user gets their own creds file based on a unique session token
// This is set later once we have the session ID
let CREDS_FILE = null

function question(query) {
  return new Promise(resolve => rl.question(`${bold}${query}${reset}`, resolve))
}

function validateSessionId(sessionId) {
  sessionId = sessionId.trim()
  if (!sessionId.startsWith('kord_ai-')) {
    return { valid: false, error: 'Must start with "kord_ai-"' }
  }
  return { valid: true, value: sessionId }
}

function validateOwnerNumber(number) {
  number = number.replace(/\s+/g, '').replace(/\+/g, '')

  if (!/^\d+$/.test(number)) {
    return { valid: false, error: 'Only digits allowed' }
  }
  if (number.length < 10 || number.length > 15) {
    return { valid: false, error: 'Must be 10-15 digits' }
  }

  return { valid: true, value: number }
}

async function getSessionId() {
  while (true) {
    const input = await question('SESSION_ID: ')
    const result = validateSessionId(input)

    if (result.valid) {
      console.log(`${green}Session ID accepted${reset}\n`)
      return result.value
    } else {
      console.log(`${red}Error: ${result.error}${reset}`)
      console.log(`${yellow}Example: kord_ai-abc123xyz${reset}`)
    }
  }
}

async function getOwnerNumber() {
  console.log(`${bold}Enter your OWNER NUMBER to continue${reset}\n`)

  while (true) {
    const input = await question('OWNER_NUMBER: ')
    const result = validateOwnerNumber(input)

    if (result.valid) {
      console.log(`${green}Owner number accepted${reset}\n`)
      return result.value
    } else {
      console.log(`${red}Error: ${result.error}${reset}`)
      console.log(`${yellow}Example: 234XXXXXXXXXX${reset}`)
    }
  }
}

function loadStoredCreds() {
  try {
    if (CREDS_FILE && fs.existsSync(CREDS_FILE)) {
      const data = fs.readFileSync(CREDS_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch {
    return null
  }
  return null
}

function deleteStoredCreds() {
  try {
    if (CREDS_FILE && fs.existsSync(CREDS_FILE)) {
      fs.unlinkSync(CREDS_FILE)
      console.log('Credentials file cleaned up')
    }
  } catch (err) {
    console.log('Note: Could not delete credentials file')
  }
}

function writeEnvFile(filePath, config) {
  const envText = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  fs.writeFileSync(filePath, envText)
}

function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Generates a unique folder name from the session ID
// e.g. kord_ai-abc123xyz → kord_abc123xyz
function getUserDir(sessionId) {
  const slug = sessionId.replace('kord_ai-', '').replace(/[^a-zA-Z0-9_-]/g, '')
  const userDir = path.join('/tmp/kord_instances', `kord_${slug}`)
  return userDir
}

async function setup() {
  try {
    let sessionId, ownerNumber

    // Step 1: Get session ID first (needed to determine user dir)
    // Check if there's a generic creds file written by the WhatsApp bot
    const genericCreds = '/tmp/kord_creds.json'
    let preloadedCreds = null

    if (fs.existsSync(genericCreds)) {
      try {
        preloadedCreds = JSON.parse(fs.readFileSync(genericCreds, 'utf8'))
      } catch {
        preloadedCreds = null
      }
    }

    if (preloadedCreds && preloadedCreds.session && preloadedCreds.owner) {
      console.log(`${green}Using saved credentials from WhatsApp${reset}\n`)
      sessionId = preloadedCreds.session
      ownerNumber = preloadedCreds.owner

      // Remove the generic creds file after reading
      try { fs.unlinkSync(genericCreds) } catch {}
    } else {
      console.log(`${bold}Enter your session ID to continue${reset}\n`)
      sessionId = await getSessionId()
      ownerNumber = await getOwnerNumber()
    }

    rl.close()

    // Step 2: Set up isolated user directory
    const userDir = getUserDir(sessionId)
    CREDS_FILE = path.join('/tmp', `kord_creds_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}.json`)

    if (fs.existsSync(userDir)) {
      console.log(`${yellow}Instance directory already exists. Cleaning up old instance...${reset}`)
      fs.rmSync(userDir, { recursive: true, force: true })
    }

    fs.mkdirSync(userDir, { recursive: true })
    console.log(`${green}Created isolated instance at: ${userDir}${reset}\n`)

    const config = {
      SESSION_ID: sessionId,
      OWNER_NUMBER: ownerNumber,
      WORKTYPE: 'private',
      PREFIX: '[.!?]',
      TIMEZONE: 'Africa/Lagos',
      OWNER_NAME: 'Mirage',
      BOT_NAME: 'Kord'
    }

    // Step 3: Clone repo into a unique temp folder per user
    const tempDir = path.join('/tmp', `kord_temp_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`)

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    console.log('Cloning repository...')
    execSync(`git clone https://github.com/M3264/Kord-Ai "${tempDir}"`, { stdio: 'inherit' })

    // Step 4: Copy cloned files into user's isolated directory
    console.log('Setting up instance directory...')
    copyDirRecursive(tempDir, userDir)
    fs.rmSync(tempDir, { recursive: true, force: true })

    // Step 5: Write config.env into the user's directory
    writeEnvFile(path.join(userDir, 'config.env'), config)

    // Step 6: Install dependencies inside the user's directory
    console.log('Installing dependencies...')
    execSync('npm install', { cwd: userDir, stdio: 'inherit' })

    deleteStoredCreds()

    // Step 7: Start bot inside the user's isolated directory
    console.log(`${green}Starting bot for session: ${sessionId}${reset}`)
    execSync('npm start', { cwd: userDir, stdio: 'inherit' })

  } catch (err) {
    console.error(`${red}Setup failed: ${err.message}${reset}`)
    rl.close()
    process.exit(1)
  }
}

setup()
