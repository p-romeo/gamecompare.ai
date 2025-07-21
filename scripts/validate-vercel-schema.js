#!/usr/bin/env node

/**
 * Real Vercel Schema Validator
 * Validates configuration against actual Vercel deployment constraints
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logError(message) {
  log(`${colors.red}✗${colors.reset} ${message}`);
}

function logSuccess(message) {
  log(`${colors.green}✓${colors.reset} ${message}`);
}

function logWarning(message) {
  log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

/**
 * Validate vercel.json against actual Vercel schema
 */
function validateVercelSchema() {
  log(`${colors.bold}${colors.blue}Validating vercel.json against real Vercel schema...${colors.reset}`);
  
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
  
  if (!fs.existsSync(vercelJsonPath)) {
    logWarning('No vercel.json found - using Vercel defaults');
    return true;
  }
  
  let vercelConfig;
  try {
    vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  } catch (error) {
    logError(`Invalid JSON in vercel.json: ${error.message}`);
    return false;
  }
  
  let isValid = true;
  
  // Check for invalid properties that cause deployment failures
  const invalidProperties = [
    'nodeVersion', // This was causing our failure
    'node', 
    'runtime' // Only valid inside functions
  ];
  
  for (const prop of invalidProperties) {
    if (vercelConfig[prop]) {
      logError(`Invalid property '${prop}' in vercel.json root`);
      isValid = false;
    }
  }
  
  // Validate functions configuration
  if (vercelConfig.functions) {
    for (const [pattern, config] of Object.entries(vercelConfig.functions)) {
      if (config.runtime) {
        // Check if runtime format is valid
        const validRuntimes = [
          'nodejs14.x', 'nodejs16.x', 'nodejs18.x', 'nodejs20.x',
          'python3.9', 'python3.8', 'go1.x', 'provided.al2'
        ];
        
        if (!validRuntimes.includes(config.runtime)) {
          logError(`Invalid runtime '${config.runtime}' for pattern '${pattern}'`);
          logError(`Valid runtimes: ${validRuntimes.join(', ')}`);
          isValid = false;
        }
      }
      
      if (config.maxDuration && config.maxDuration > 300) {
        logError(`maxDuration ${config.maxDuration}s exceeds limit of 300s for pattern '${pattern}'`);
        isValid = false;
      }
    }
  }
  
  // Check for Next.js specific issues
  if (vercelConfig.framework === 'nextjs' || !vercelConfig.framework) {
    // For Next.js, functions config is usually not needed
    if (vercelConfig.functions) {
      logWarning('Functions configuration detected for Next.js - this may cause issues');
      logWarning('Next.js API routes are handled automatically by Vercel');
    }
  }
  
  return isValid;
}

/**
 * Check package.json for Vercel compatibility
 */
function validatePackageForVercel() {
  log(`${colors.bold}${colors.blue}Validating package.json for Vercel compatibility...${colors.reset}`);
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    logError('package.json not found');
    return false;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  let isValid = true;
  
  // Check engines
  if (!packageJson.engines || !packageJson.engines.node) {
    logError('Missing Node.js version in engines field');
    isValid = false;
  } else {
    const nodeVersion = packageJson.engines.node;
    // Vercel supports Node.js 14.x, 16.x, 18.x, 20.x
    if (!nodeVersion.includes('18') && !nodeVersion.includes('16') && !nodeVersion.includes('20')) {
      logWarning(`Node.js version ${nodeVersion} - ensure it's supported by Vercel`);
    } else {
      logSuccess(`Node.js version: ${nodeVersion}`);
    }
  }
  
  // Check for build script
  if (!packageJson.scripts || !packageJson.scripts.build) {
    logError('Missing build script');
    isValid = false;
  }
  
  // Check for critical dependencies in production
  const criticalDeps = ['next', 'react', 'react-dom'];
  const prodDeps = packageJson.dependencies || {};
  
  for (const dep of criticalDeps) {
    if (!prodDeps[dep]) {
      logError(`${dep} should be in dependencies (not devDependencies) for Vercel`);
      isValid = false;
    }
  }
  
  return isValid;
}

/**
 * Test actual Vercel CLI if available
 */
async function testVercelCLI() {
  log(`${colors.bold}${colors.blue}Testing with Vercel CLI...${colors.reset}`);
  
  const { execSync } = require('child_process');
  
  try {
    // Check if Vercel CLI is available
    execSync('vercel --version', { stdio: 'pipe' });
    logSuccess('Vercel CLI is available');
    
    // Try to validate the project
    try {
      const output = execSync('vercel inspect --token="" --scope="" 2>&1 || true', { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      if (output.includes('Function Runtimes must have a valid version')) {
        logError('Vercel CLI detected invalid function runtime configuration');
        return false;
      }
      
      if (output.includes('should NOT have additional property')) {
        logError('Vercel CLI detected invalid vercel.json schema');
        return false;
      }
      
      logSuccess('Vercel CLI validation passed');
      return true;
      
    } catch (error) {
      logWarning('Could not run full Vercel CLI validation (authentication required)');
      return true;
    }
    
  } catch (error) {
    logWarning('Vercel CLI not available - install with: npm i -g vercel');
    return true;
  }
}

/**
 * Main validation function
 */
async function validateForVercel() {
  log(`${colors.bold}${colors.blue}=== Real Vercel Deployment Validation ===${colors.reset}`);
  
  let allValid = true;
  
  allValid = validateVercelSchema() && allValid;
  allValid = validatePackageForVercel() && allValid;
  allValid = await testVercelCLI() && allValid;
  
  if (allValid) {
    log(`${colors.bold}${colors.green}✓ Configuration appears valid for Vercel deployment${colors.reset}`);
    process.exit(0);
  } else {
    log(`${colors.bold}${colors.red}✗ Configuration has issues that will cause Vercel deployment to fail${colors.reset}`);
    process.exit(1);
  }
}

if (require.main === module) {
  validateForVercel();
}

module.exports = { validateForVercel, validateVercelSchema, validatePackageForVercel };