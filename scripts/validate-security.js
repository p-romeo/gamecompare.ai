#!/usr/bin/env node

/**
 * Security validation script for build process
 * Validates that security-related dependencies and configurations are in place
 */

const { execSync } = require('child_process');
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

function logSuccess(message) {
  log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message) {
  log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

/**
 * Validate security headers in vercel.json
 */
function validateSecurityHeaders() {
  log(`${colors.blue}Validating security headers...${colors.reset}`);
  
  const vercelConfigPath = path.join(process.cwd(), 'vercel.json');
  if (!fs.existsSync(vercelConfigPath)) {
    logWarning('vercel.json not found');
    return;
  }
  
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    
    if (!vercelConfig.headers) {
      logWarning('No security headers configured in vercel.json');
      return;
    }
    
    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
      'Content-Security-Policy'
    ];
    
    const configuredHeaders = [];
    vercelConfig.headers.forEach(headerConfig => {
      if (headerConfig.headers) {
        headerConfig.headers.forEach(header => {
          configuredHeaders.push(header.key);
        });
      }
    });
    
    const missingHeaders = requiredHeaders.filter(header => 
      !configuredHeaders.includes(header)
    );
    
    if (missingHeaders.length === 0) {
      logSuccess('All required security headers are configured');
    } else {
      logWarning(`Missing security headers: ${missingHeaders.join(', ')}`);
    }
    
  } catch (error) {
    logError(`Error reading vercel.json: ${error.message}`);
  }
}

/**
 * Validate environment variables setup
 */
function validateEnvironmentSetup() {
  log(`${colors.blue}Validating environment setup...${colors.reset}`);
  
  const envFiles = ['.env.local.example', '.env.production.example'];
  
  envFiles.forEach(envFile => {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      logSuccess(`${envFile} found`);
    } else {
      logWarning(`${envFile} not found`);
    }
  });
}

/**
 * Validate build configuration
 */
function validateBuildConfig() {
  log(`${colors.blue}Validating build configuration...${colors.reset}`);
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    logError('package.json not found');
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Check for required scripts
  const requiredScripts = ['build', 'pre-build', 'build:production'];
  const missingScripts = requiredScripts.filter(script => 
    !packageJson.scripts || !packageJson.scripts[script]
  );
  
  if (missingScripts.length === 0) {
    logSuccess('All required build scripts are configured');
  } else {
    logWarning(`Missing build scripts: ${missingScripts.join(', ')}`);
  }
  
  // Check Node.js version specification
  if (packageJson.engines && packageJson.engines.node) {
    logSuccess(`Node.js version specified: ${packageJson.engines.node}`);
  } else {
    logWarning('Node.js version not specified in package.json engines');
  }
}

/**
 * Main security validation function
 */
async function runSecurityValidation() {
  log(`${colors.bold}${colors.blue}Starting security validation...${colors.reset}`);
  
  try {
    validateSecurityHeaders();
    validateEnvironmentSetup();
    validateBuildConfig();
    
    log(`${colors.bold}${colors.green}✓ Security validation completed!${colors.reset}`);
    process.exit(0);
  } catch (error) {
    log(`${colors.bold}${colors.red}✗ Security validation failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  runSecurityValidation();
}

module.exports = {
  validateSecurityHeaders,
  validateEnvironmentSetup,
  validateBuildConfig,
  runSecurityValidation
};