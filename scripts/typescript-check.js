#!/usr/bin/env node

/**
 * TypeScript compilation check script
 * Validates TypeScript configuration and runs type checking
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
 * Validate TypeScript configuration
 */
function validateTSConfig() {
  log(`${colors.blue}Validating TypeScript configuration...${colors.reset}`);
  
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error('tsconfig.json not found in project root');
  }
  
  try {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    
    // Check for essential compiler options
    const compilerOptions = tsconfig.compilerOptions || {};
    
    const requiredOptions = {
      'strict': true,
      'esModuleInterop': true,
      'skipLibCheck': true,
      'forceConsistentCasingInFileNames': true
    };
    
    const warnings = [];
    
    for (const [option, expectedValue] of Object.entries(requiredOptions)) {
      if (compilerOptions[option] !== expectedValue) {
        warnings.push(`${option} should be ${expectedValue}`);
      }
    }
    
    if (warnings.length > 0) {
      logWarning('TypeScript configuration recommendations:');
      warnings.forEach(warning => logWarning(`  - ${warning}`));
    }
    
    logSuccess('TypeScript configuration is valid');
    return tsconfig;
  } catch (error) {
    throw new Error(`Invalid tsconfig.json: ${error.message}`);
  }
}

/**
 * Check TypeScript compiler availability
 */
function checkTypeScriptCompiler() {
  log(`${colors.blue}Checking TypeScript compiler...${colors.reset}`);
  
  try {
    const version = execSync('npx tsc --version', { 
      stdio: 'pipe',
      encoding: 'utf8'
    }).trim();
    
    logSuccess(`TypeScript compiler available: ${version}`);
  } catch (error) {
    throw new Error('TypeScript compiler not found or not accessible');
  }
}

/**
 * Run TypeScript compilation check
 */
function runTypeCheck() {
  log(`${colors.blue}Running TypeScript type checking...${colors.reset}`);
  
  try {
    // Run tsc with noEmit to check types without generating files
    const output = execSync('npx tsc --noEmit --pretty', { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    if (output.trim()) {
      console.log(output);
    }
    
    logSuccess('TypeScript type checking passed');
  } catch (error) {
    logError('TypeScript type checking failed');
    
    // Output the TypeScript errors
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    
    throw new Error('TypeScript compilation errors found');
  }
}

/**
 * Check for common TypeScript issues
 */
function checkCommonIssues() {
  log(`${colors.blue}Checking for common TypeScript issues...${colors.reset}`);
  
  const issues = [];
  
  // Check for missing @types packages
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    const commonTypesPackages = [
      { package: 'react', types: '@types/react' },
      { package: 'react-dom', types: '@types/react-dom' },
      { package: 'node', types: '@types/node' }
    ];
    
    for (const { package: pkg, types } of commonTypesPackages) {
      if (dependencies[pkg] && !dependencies[types]) {
        issues.push(`Missing ${types} for ${pkg}`);
      }
    }
  }
  
  if (issues.length > 0) {
    logWarning('Potential TypeScript issues found:');
    issues.forEach(issue => logWarning(`  - ${issue}`));
  } else {
    logSuccess('No common TypeScript issues detected');
  }
}

/**
 * Main TypeScript validation function
 */
async function runTypeScriptCheck() {
  log(`${colors.bold}${colors.blue}Starting TypeScript validation...${colors.reset}`);
  
  try {
    validateTSConfig();
    checkTypeScriptCompiler();
    checkCommonIssues();
    runTypeCheck();
    
    log(`${colors.bold}${colors.green}✓ TypeScript validation completed successfully!${colors.reset}`);
    process.exit(0);
  } catch (error) {
    log(`${colors.bold}${colors.red}✗ TypeScript validation failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  runTypeScriptCheck();
}

module.exports = {
  validateTSConfig,
  checkTypeScriptCompiler,
  runTypeCheck,
  checkCommonIssues,
  runTypeScriptCheck
};