#!/usr/bin/env node

/**
 * Build Configuration Validator
 * Validates build configuration before deployment to ensure Vercel compatibility
 * Requirements: 3.4, 4.4, 1.4
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  const timestamp = new Date().toISOString();
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`${colors.blue}[${step}]${colors.reset} ${message}`);
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
 * Validate package.json configuration for Vercel deployment
 */
function validatePackageJson() {
  logStep('1/6', 'Validating package.json configuration...');
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const issues = [];
  const warnings = [];
  
  // Check engines specification
  if (!packageJson.engines) {
    issues.push('Missing engines specification');
  } else {
    if (!packageJson.engines.node) {
      warnings.push('Node.js version not specified in engines');
    } else {
      logSuccess(`Node.js version specified: ${packageJson.engines.node}`);
    }
    
    if (!packageJson.engines.npm) {
      warnings.push('npm version not specified in engines');
    }
  }
  
  // Check build script
  if (!packageJson.scripts || !packageJson.scripts.build) {
    issues.push('Missing build script');
  } else {
    logSuccess('Build script found');
  }
  
  // Check critical dependencies are in dependencies (not just devDependencies)
  const criticalDeps = ['typescript', 'eslint', '@types/react', '@types/react-dom', '@types/node'];
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};
  
  for (const dep of criticalDeps) {
    if (!dependencies[dep] && !devDependencies[dep]) {
      issues.push(`Missing critical dependency: ${dep}`);
    } else if (dependencies[dep]) {
      logSuccess(`${dep} found in dependencies`);
    } else {
      logSuccess(`${dep} found in devDependencies`);
    }
  }
  
  // Check for Next.js specific configuration
  if (dependencies.next || devDependencies.next) {
    logSuccess('Next.js detected');
    
    if (!dependencies['eslint-config-next'] && !devDependencies['eslint-config-next']) {
      warnings.push('eslint-config-next not found - recommended for Next.js projects');
    }
  }
  
  if (issues.length > 0) {
    logError('Package.json validation issues:');
    issues.forEach(issue => logError(`  - ${issue}`));
    throw new Error('Package.json validation failed');
  }
  
  if (warnings.length > 0) {
    logWarning('Package.json recommendations:');
    warnings.forEach(warning => logWarning(`  - ${warning}`));
  }
  
  logSuccess('Package.json configuration is valid');
}

/**
 * Validate Vercel configuration
 */
function validateVercelConfig() {
  logStep('2/6', 'Validating Vercel configuration...');
  
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
  
  if (!fs.existsSync(vercelJsonPath)) {
    logWarning('vercel.json not found - using default Vercel configuration');
    return;
  }
  
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    
    // Check framework detection
    if (vercelConfig.framework) {
      logSuccess(`Framework specified: ${vercelConfig.framework}`);
    } else {
      logWarning('Framework not specified - relying on auto-detection');
    }
    
    // Check Node.js runtime version in functions
    if (vercelConfig.functions) {
      const functionConfigs = Object.values(vercelConfig.functions);
      const runtimes = functionConfigs
        .filter(config => config && config.runtime)
        .map(config => config.runtime);
      
      if (runtimes.length > 0) {
        logSuccess(`Runtime(s) specified: ${runtimes.join(', ')}`);
      }
    }
    
    // Check build commands
    if (vercelConfig.buildCommand) {
      logSuccess(`Custom build command: ${vercelConfig.buildCommand}`);
    }
    
    if (vercelConfig.installCommand) {
      logSuccess(`Custom install command: ${vercelConfig.installCommand}`);
    }
    
    logSuccess('Vercel configuration is valid');
  } catch (error) {
    throw new Error(`Invalid vercel.json: ${error.message}`);
  }
}

/**
 * Validate TypeScript configuration
 */
function validateTypeScriptConfig() {
  logStep('3/6', 'Validating TypeScript configuration...');
  
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    logWarning('tsconfig.json not found - TypeScript may not be configured');
    return;
  }
  
  try {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const compilerOptions = tsconfig.compilerOptions || {};
    
    // Check essential options for production builds
    const recommendations = [];
    
    if (!compilerOptions.strict) {
      recommendations.push('Enable strict mode for better type safety');
    }
    
    if (!compilerOptions.skipLibCheck) {
      recommendations.push('Enable skipLibCheck for faster builds');
    }
    
    if (compilerOptions.incremental !== false && !compilerOptions.tsBuildInfoFile) {
      recommendations.push('Consider setting tsBuildInfoFile for incremental builds');
    }
    
    if (recommendations.length > 0) {
      logWarning('TypeScript configuration recommendations:');
      recommendations.forEach(rec => logWarning(`  - ${rec}`));
    }
    
    logSuccess('TypeScript configuration validated');
  } catch (error) {
    throw new Error(`Invalid tsconfig.json: ${error.message}`);
  }
}

/**
 * Validate Next.js configuration
 */
function validateNextConfig() {
  logStep('4/6', 'Validating Next.js configuration...');
  
  const nextConfigPath = path.join(process.cwd(), 'next.config.js');
  
  if (!fs.existsSync(nextConfigPath)) {
    logWarning('next.config.js not found - using default Next.js configuration');
    return;
  }
  
  try {
    // Basic syntax check by requiring the config
    delete require.cache[require.resolve(path.resolve(nextConfigPath))];
    const nextConfig = require(path.resolve(nextConfigPath));
    
    if (typeof nextConfig === 'object') {
      // Check for common production optimizations
      if (nextConfig.compress !== false) {
        logSuccess('Compression enabled (default)');
      }
      
      if (nextConfig.poweredByHeader === false) {
        logSuccess('X-Powered-By header disabled for security');
      }
      
      if (nextConfig.generateEtags !== false) {
        logSuccess('ETags enabled for caching (default)');
      }
      
      // Check for potential issues
      if (nextConfig.experimental && Object.keys(nextConfig.experimental).length > 0) {
        logWarning('Experimental features detected - ensure they are stable for production');
      }
    }
    
    logSuccess('Next.js configuration validated');
  } catch (error) {
    throw new Error(`Invalid next.config.js: ${error.message}`);
  }
}

/**
 * Validate environment configuration
 */
function validateEnvironmentConfig() {
  logStep('5/6', 'Validating environment configuration...');
  
  const envFiles = ['.env.local', '.env.production', '.env'];
  const foundEnvFiles = envFiles.filter(file => 
    fs.existsSync(path.join(process.cwd(), file))
  );
  
  if (foundEnvFiles.length === 0) {
    logWarning('No environment files found');
  } else {
    logSuccess(`Environment files found: ${foundEnvFiles.join(', ')}`);
  }
  
  // Check for example files
  const exampleFiles = ['.env.example', '.env.local.example', '.env.production.example'];
  const foundExampleFiles = exampleFiles.filter(file => 
    fs.existsSync(path.join(process.cwd(), file))
  );
  
  if (foundExampleFiles.length > 0) {
    logSuccess(`Environment example files found: ${foundExampleFiles.join(', ')}`);
  }
  
  // Check for common required environment variables in Next.js
  const requiredEnvVars = process.env;
  const nextjsEnvVars = Object.keys(requiredEnvVars).filter(key => 
    key.startsWith('NEXT_PUBLIC_') || key.startsWith('VERCEL_')
  );
  
  if (nextjsEnvVars.length > 0) {
    logSuccess(`Next.js/Vercel environment variables detected: ${nextjsEnvVars.length}`);
  }
  
  logSuccess('Environment configuration validated');
}

/**
 * Validate build dependencies and tools
 */
function validateBuildTools() {
  logStep('6/6', 'Validating build tools and dependencies...');
  
  const tools = [
    { name: 'Node.js', command: 'node --version' },
    { name: 'npm', command: 'npm --version' },
    { name: 'TypeScript', command: 'npx tsc --version' },
    { name: 'ESLint', command: 'npx eslint --version' },
    { name: 'Next.js', command: 'npx next --version' }
  ];
  
  for (const tool of tools) {
    try {
      const version = execSync(tool.command, { 
        stdio: 'pipe',
        encoding: 'utf8'
      }).trim();
      
      logSuccess(`${tool.name}: ${version}`);
    } catch (error) {
      logWarning(`${tool.name}: Not available or not accessible`);
    }
  }
  
  // Check node_modules exists and has content
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    const stats = fs.statSync(nodeModulesPath);
    if (stats.isDirectory()) {
      logSuccess('node_modules directory exists');
    }
  } else {
    logWarning('node_modules directory not found - dependencies may not be installed');
  }
  
  logSuccess('Build tools validation completed');
}

/**
 * Generate build configuration report
 */
function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    validation: 'passed'
  };
  
  const reportPath = path.join(process.cwd(), 'build-config-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  logSuccess(`Build configuration report generated: ${reportPath}`);
}

/**
 * Main validation function
 */
async function validateBuildConfiguration() {
  log(`${colors.bold}${colors.blue}Starting build configuration validation...${colors.reset}`);
  
  try {
    validatePackageJson();
    validateVercelConfig();
    validateTypeScriptConfig();
    validateNextConfig();
    validateEnvironmentConfig();
    validateBuildTools();
    generateReport();
    
    log(`${colors.bold}${colors.green}✓ Build configuration validation completed successfully!${colors.reset}`);
    process.exit(0);
  } catch (error) {
    logError(`Build configuration validation failed: ${error.message}`);
    
    // Generate error report
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      validation: 'failed'
    };
    
    const errorReportPath = path.join(process.cwd(), 'build-config-error.json');
    fs.writeFileSync(errorReportPath, JSON.stringify(errorReport, null, 2));
    
    log(`${colors.bold}${colors.red}✗ Build configuration validation failed!${colors.reset}`);
    log(`Error report generated: ${errorReportPath}`);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validateBuildConfiguration();
}

module.exports = {
  validatePackageJson,
  validateVercelConfig,
  validateTypeScriptConfig,
  validateNextConfig,
  validateEnvironmentConfig,
  validateBuildTools,
  validateBuildConfiguration
};