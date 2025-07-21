#!/usr/bin/env node

/**
 * ESLint validation script
 * Validates ESLint configuration and runs linting checks
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
 * Find ESLint configuration file
 */
function findESLintConfig() {
  const configFiles = [
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc',
    'eslint.config.js'
  ];
  
  for (const configFile of configFiles) {
    const configPath = path.join(process.cwd(), configFile);
    if (fs.existsSync(configPath)) {
      return { path: configPath, name: configFile };
    }
  }
  
  // Check for eslintConfig in package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (packageJson.eslintConfig) {
      return { path: packageJsonPath, name: 'package.json (eslintConfig)' };
    }
  }
  
  return null;
}

/**
 * Validate ESLint configuration
 */
function validateESLintConfig() {
  log(`${colors.blue}Validating ESLint configuration...${colors.reset}`);
  
  const config = findESLintConfig();
  
  if (!config) {
    throw new Error('No ESLint configuration found');
  }
  
  logSuccess(`ESLint configuration found: ${config.name}`);
  
  try {
    // Test ESLint configuration by running it with --print-config
    execSync('npx eslint --print-config package.json', { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    logSuccess('ESLint configuration is valid');
  } catch (error) {
    throw new Error(`Invalid ESLint configuration: ${error.message}`);
  }
}

/**
 * Check ESLint availability
 */
function checkESLintAvailability() {
  log(`${colors.blue}Checking ESLint availability...${colors.reset}`);
  
  try {
    const version = execSync('npx eslint --version', { 
      stdio: 'pipe',
      encoding: 'utf8'
    }).trim();
    
    logSuccess(`ESLint available: ${version}`);
  } catch (error) {
    throw new Error('ESLint not found or not accessible');
  }
}

/**
 * Find source directories to lint
 */
function findSourceDirectories() {
  const possibleDirs = ['src', 'pages', 'components', 'lib', 'utils'];
  const existingDirs = [];
  
  for (const dir of possibleDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      existingDirs.push(dir);
    }
  }
  
  return existingDirs;
}

/**
 * Run ESLint validation
 */
function runESLintCheck() {
  log(`${colors.blue}Running ESLint validation...${colors.reset}`);
  
  const sourceDirs = findSourceDirectories();
  
  if (sourceDirs.length === 0) {
    logWarning('No source directories found to lint');
    return;
  }
  
  log(`Linting directories: ${sourceDirs.join(', ')}`);
  
  try {
    // Run ESLint on found directories
    const eslintCommand = `npx eslint ${sourceDirs.join(' ')} --ext .ts,.tsx,.js,.jsx --format=stylish`;
    const output = execSync(eslintCommand, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    if (output.trim()) {
      console.log(output);
    }
    
    logSuccess('ESLint validation passed');
  } catch (error) {
    logError('ESLint validation failed');
    
    // Output ESLint results
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    
    throw new Error('ESLint found issues in the code');
  }
}

/**
 * Check for Next.js ESLint integration
 */
function checkNextJSIntegration() {
  log(`${colors.blue}Checking Next.js ESLint integration...${colors.reset}`);
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    logWarning('package.json not found');
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (dependencies['next'] && dependencies['eslint-config-next']) {
    logSuccess('Next.js ESLint integration detected');
    
    // Check if Next.js lint script exists
    if (packageJson.scripts && packageJson.scripts.lint) {
      logSuccess('Next.js lint script found');
    } else {
      logWarning('Consider adding "lint": "next lint" to package.json scripts');
    }
  } else if (dependencies['next']) {
    logWarning('Next.js detected but eslint-config-next not found');
  }
}

/**
 * Run ESLint with Next.js if available
 */
function runNextJSLint() {
  log(`${colors.blue}Running Next.js ESLint check...${colors.reset}`);
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (!dependencies['next'] || !dependencies['eslint-config-next']) {
    return;
  }
  
  try {
    const output = execSync('npx next lint', { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    if (output.trim()) {
      console.log(output);
    }
    
    logSuccess('Next.js ESLint check passed');
  } catch (error) {
    logError('Next.js ESLint check failed');
    
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    
    throw new Error('Next.js ESLint check found issues');
  }
}

/**
 * Main ESLint validation function
 */
async function runESLintValidation() {
  log(`${colors.bold}${colors.blue}Starting ESLint validation...${colors.reset}`);
  
  try {
    validateESLintConfig();
    checkESLintAvailability();
    checkNextJSIntegration();
    runESLintCheck();
    runNextJSLint();
    
    log(`${colors.bold}${colors.green}✓ ESLint validation completed successfully!${colors.reset}`);
    process.exit(0);
  } catch (error) {
    log(`${colors.bold}${colors.red}✗ ESLint validation failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  runESLintValidation();
}

module.exports = {
  findESLintConfig,
  validateESLintConfig,
  checkESLintAvailability,
  runESLintCheck,
  checkNextJSIntegration,
  runNextJSLint,
  runESLintValidation
};