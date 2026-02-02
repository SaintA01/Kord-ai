const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// ANSI color codes
const bold = '\x1b[1m'
const green = '\x1b[32m'
const red = '\x1b[31m'
const yellow = '\x1b[33m'
const reset = '\x1b[0m'

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

function writeEnvFile(filePath, config) {
  const envText = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  fs.writeFileSync(filePath, envText)
}

function moveFilesToRoot(srcDir, destDir) {
  const files = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const file of files) {
    const srcPath = path.join(srcDir, file.name)
    const destPath = path.join(destDir, file.name)

    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true })
    }

    fs.renameSync(srcPath, destPath)
  }
}

async function setup() {
  try {
    console.log(`${bold}Enter your session ID to continue${reset}\n`)
    
    const sessionId = await getSessionId()
    const ownerNumber = await getOwnerNumber()
    
    rl.close()
    
    const config = {
      SESSION_ID: sessionId,
      OWNER_NUMBER: ownerNumber,
      WORKTYPE: 'private',
      PREFIX: '[.!?]',
      TIMEZONE: 'Africa/Lagos',
      OWNER_NAME: 'Mirage',
      BOT_NAME: 'Kord'
    }
    
    console.log('Cloning repository...')
    execSync('git clone https://github.com/M3264/Kord-Ai temp-dir', { stdio: 'inherit' })

    const rootDir = process.cwd()
    const tempDir = path.join(rootDir, 'temp-dir')

    moveFilesToRoot(tempDir, rootDir)
    fs.rmdirSync(tempDir, { recursive: true })

    writeEnvFile(path.join(rootDir, 'config.env'), config)

    console.log('Installing dependencies...')
    execSync('npm install', { stdio: 'inherit' })

    console.log('Starting bot...')
    execSync('npm start', { stdio: 'inherit' })

  } catch (err) {
    console.error('Setup failed:', err.message)
    rl.close()
    process.exit(1)
  }
}

setup()
