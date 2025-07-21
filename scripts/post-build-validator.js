#!/usr/bin/env node

/**
 * Post-Build Validator
 * Validates generated assets and build output after Next.js build completes
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
 * Get file size in human readable format
 */
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  const bytes = stats.size;
  
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate Next.js build output directory structure
 */
function validateBuildDirectory() {
  logStep('1/7', 'Validating build directory structure...');
  
  const buildDir = path.join(process.cwd(), '.next');
  
  if (!fs.existsSync(buildDir)) {
    throw new Error('.next build directory not found - build may have failed');
  }
  
  logSuccess('.next directory exists');
  
  // Check for essential build artifacts
  const requiredPaths = [
    '.next/static',
    '.next/server',
    '.next/BUILD_ID'
  ];
  
  const missingPaths = [];
  
  for (const requiredPath of requiredPaths) {
    const fullPath = path.join(process.cwd(), requiredPath);
    if (!fs.existsSync(fullPath)) {
      missingPaths.push(requiredPath);
    } else {
      logSuccess(`${requiredPath} exists`);
    }
  }
  
  if (missingPaths.length > 0) {
    throw new Error(`Missing required build artifacts: ${missingPaths.join(', ')}`);
  }
  
  // Check BUILD_ID
  const buildIdPath = path.join(process.cwd(), '.next/BUILD_ID');
  const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
  logSuccess(`Build ID: ${buildId}`);
  
  logSuccess('Build directory structure is valid');
}

/**
 * Validate static assets
 */
function validateStaticAssets() {
  logStep('2/7', 'Validating static assets...');
  
  const staticDir = path.join(process.cwd(), '.next/static');
  
  if (!fs.existsSync(staticDir)) {
    throw new Error('Static assets directory not found');
  }
  
  // Check for chunks directory
  const chunksDir = path.join(staticDir, 'chunks');
  if (fs.existsSync(chunksDir)) {
    const chunkFiles = fs.readdirSync(chunksDir).filter(file => file.endsWith('.js'));
    logSuccess(`JavaScript chunks generated: ${chunkFiles.length}`);
    
    // Check for main application chunk
    const mainChunks = chunkFiles.filter(file => file.includes('main') || file.includes('app'));
    if (mainChunks.length > 0) {
      logSuccess(`Main application chunks found: ${mainChunks.length}`);
    }
  }
  
  // Check for CSS assets
  const cssDir = path.join(staticDir, 'css');
  if (fs.existsSync(cssDir)) {
    const cssFiles = fs.readdirSync(cssDir).filter(file => file.endsWith('.css'));
    logSuccess(`CSS files generated: ${cssFiles.length}`);
  }
  
  // Check for media assets
  const mediaDir = path.join(staticDir, 'media');
  if (fs.existsSync(mediaDir)) {
    const mediaFiles = fs.readdirSync(mediaDir);
    logSuccess(`Media files: ${mediaFiles.length}`);
  }
  
  logSuccess('Static assets validation completed');
}

/**
 * Validate server-side assets
 */
function validateServerAssets() {
  logStep('3/7', 'Validating server-side assets...');
  
  const serverDir = path.join(process.cwd(), '.next/server');
  
  if (!fs.existsSync(serverDir)) {
    throw new Error('Server directory not found');
  }
  
  // Check for pages directory
  const pagesDir = path.join(serverDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pageFiles = fs.readdirSync(pagesDir, { recursive: true })
      .filter(file => typeof file === 'string' && (file.endsWith('.js') || file.endsWith('.html')));
    logSuccess(`Server pages generated: ${pageFiles.length}`);
  }
  
  // Check for app directory (App Router)
  const appDir = path.join(serverDir, 'app');
  if (fs.existsSync(appDir)) {
    const appFiles = fs.readdirSync(appDir, { recursive: true })
      .filter(file => typeof file === 'string' && (file.endsWith('.js') || file.endsWith('.html')));
    logSuccess(`App router files generated: ${appFiles.length}`);
  }
  
  // Check for API routes
  const apiDir = path.join(pagesDir || serverDir, 'api');
  if (fs.existsSync(apiDir)) {
    const apiFiles = fs.readdirSync(apiDir, { recursive: true })
      .filter(file => typeof file === 'string' && file.endsWith('.js'));
    logSuccess(`API routes generated: ${apiFiles.length}`);
  }
  
  logSuccess('Server-side assets validation completed');
}

/**
 * Analyze bundle sizes and performance
 */
function analyzeBundleSizes() {
  logStep('4/7', 'Analyzing bundle sizes...');
  
  const staticDir = path.join(process.cwd(), '.next/static');
  const chunksDir = path.join(staticDir, 'chunks');
  
  if (!fs.existsSync(chunksDir)) {
    logWarning('Chunks directory not found - skipping bundle analysis');
    return;
  }
  
  const jsFiles = fs.readdirSync(chunksDir, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.js'))
    .map(file => {
      const filePath = path.join(chunksDir, file);
      return {
        name: file,
        size: fs.statSync(filePath).size,
        sizeFormatted: getFileSize(filePath)
      };
    })
    .sort((a, b) => b.size - a.size);
  
  if (jsFiles.length === 0) {
    logWarning('No JavaScript files found in chunks directory');
    return;
  }
  
  logSuccess(`Total JavaScript files: ${jsFiles.length}`);
  
  // Show largest files
  const largeFiles = jsFiles.slice(0, 5);
  logSuccess('Largest JavaScript bundles:');
  largeFiles.forEach(file => {
    log(`  - ${file.name}: ${file.sizeFormatted}`);
  });
  
  // Check for oversized bundles
  const oversizedFiles = jsFiles.filter(file => file.size > 1024 * 1024); // > 1MB
  if (oversizedFiles.length > 0) {
    logWarning(`Large bundles detected (>1MB): ${oversizedFiles.length}`);
    oversizedFiles.forEach(file => {
      logWarning(`  - ${file.name}: ${file.sizeFormatted}`);
    });
  }
  
  // Calculate total bundle size
  const totalSize = jsFiles.reduce((sum, file) => sum + file.size, 0);
  const totalSizeFormatted = (totalSize / (1024 * 1024)).toFixed(2) + ' MB';
  logSuccess(`Total JavaScript bundle size: ${totalSizeFormatted}`);
  
  logSuccess('Bundle size analysis completed');
}

/**
 * Validate build manifest and metadata
 */
function validateBuildManifest() {
  logStep('5/7', 'Validating build manifest...');
  
  const manifestPath = path.join(process.cwd(), '.next/build-manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    logWarning('Build manifest not found - may be using newer Next.js version');
    return;
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    if (manifest.pages) {
      const pageCount = Object.keys(manifest.pages).length;
      logSuccess(`Pages in manifest: ${pageCount}`);
    }
    
    if (manifest.devFiles) {
      logSuccess('Development files excluded from production build');
    }
    
    logSuccess('Build manifest is valid');
  } catch (error) {
    logError(`Invalid build manifest: ${error.message}`);
  }
  
  // Check for prerender manifest
  const prerenderManifestPath = path.join(process.cwd(), '.next/prerender-manifest.json');
  if (fs.existsSync(prerenderManifestPath)) {
    try {
      const prerenderManifest = JSON.parse(fs.readFileSync(prerenderManifestPath, 'utf8'));
      
      if (prerenderManifest.routes) {
        const prerenderCount = Object.keys(prerenderManifest.routes).length;
        logSuccess(`Pre-rendered routes: ${prerenderCount}`);
      }
      
      logSuccess('Prerender manifest is valid');
    } catch (error) {
      logWarning(`Invalid prerender manifest: ${error.message}`);
    }
  }
}

/**
 * Validate TypeScript compilation output
 */
function validateTypeScriptOutput() {
  logStep('6/7', 'Validating TypeScript compilation...');
  
  // Check if TypeScript was used in the build
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    logWarning('TypeScript not detected - skipping TypeScript validation');
    return;
  }
  
  // Check for TypeScript build info file
  const buildInfoPath = path.join(process.cwd(), 'tsconfig.tsbuildinfo');
  if (fs.existsSync(buildInfoPath)) {
    logSuccess('TypeScript incremental build info found');
  }
  
  // Verify no TypeScript files remain in build output
  const serverDir = path.join(process.cwd(), '.next/server');
  if (fs.existsSync(serverDir)) {
    const tsFiles = [];
    
    function findTsFiles(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          findTsFiles(filePath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          tsFiles.push(filePath);
        }
      }
    }
    
    findTsFiles(serverDir);
    
    if (tsFiles.length > 0) {
      logWarning(`TypeScript files found in build output: ${tsFiles.length}`);
      tsFiles.slice(0, 3).forEach(file => {
        logWarning(`  - ${path.relative(process.cwd(), file)}`);
      });
    } else {
      logSuccess('TypeScript files properly compiled to JavaScript');
    }
  }
  
  logSuccess('TypeScript compilation validation completed');
}

/**
 * Validate deployment readiness
 */
function validateDeploymentReadiness() {
  logStep('7/7', 'Validating deployment readiness...');
  
  const checks = [];
  
  // Check for required files
  const requiredFiles = [
    'package.json',
    '.next/BUILD_ID',
    '.next/static',
    '.next/server'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      checks.push({ name: file, status: 'pass' });
    } else {
      checks.push({ name: file, status: 'fail' });
    }
  }
  
  // Check for common issues
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    checks.push({ name: 'Dependencies installed', status: 'pass' });
  } else {
    checks.push({ name: 'Dependencies installed', status: 'warn' });
  }
  
  // Check environment variables
  const hasNextPublicVars = Object.keys(process.env).some(key => 
    key.startsWith('NEXT_PUBLIC_')
  );
  
  if (hasNextPublicVars) {
    checks.push({ name: 'Environment variables', status: 'pass' });
  } else {
    checks.push({ name: 'Environment variables', status: 'warn' });
  }
  
  // Report results
  const passed = checks.filter(check => check.status === 'pass').length;
  const failed = checks.filter(check => check.status === 'fail').length;
  const warnings = checks.filter(check => check.status === 'warn').length;
  
  logSuccess(`Deployment readiness: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  
  if (failed > 0) {
    logError('Deployment readiness check failed:');
    checks.filter(check => check.status === 'fail').forEach(check => {
      logError(`  - ${check.name}`);
    });
    throw new Error('Deployment readiness validation failed');
  }
  
  if (warnings > 0) {
    logWarning('Deployment readiness warnings:');
    checks.filter(check => check.status === 'warn').forEach(check => {
      logWarning(`  - ${check.name}`);
    });
  }
  
  logSuccess('Deployment readiness validation completed');
}

/**
 * Generate post-build validation report
 */
function generateValidationReport() {
  const buildDir = path.join(process.cwd(), '.next');
  const buildId = fs.existsSync(path.join(buildDir, 'BUILD_ID')) 
    ? fs.readFileSync(path.join(buildDir, 'BUILD_ID'), 'utf8').trim()
    : 'unknown';
  
  const report = {
    timestamp: new Date().toISOString(),
    buildId: buildId,
    nodeVersion: process.version,
    platform: process.platform,
    validation: 'passed',
    buildDirectory: {
      exists: fs.existsSync(buildDir),
      size: fs.existsSync(buildDir) ? getDirectorySize(buildDir) : 0
    }
  };
  
  const reportPath = path.join(process.cwd(), 'post-build-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  logSuccess(`Post-build validation report generated: ${reportPath}`);
}

/**
 * Get directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  function calculateSize(currentPath) {
    const stats = fs.statSync(currentPath);
    
    if (stats.isFile()) {
      totalSize += stats.size;
    } else if (stats.isDirectory()) {
      const files = fs.readdirSync(currentPath);
      for (const file of files) {
        calculateSize(path.join(currentPath, file));
      }
    }
  }
  
  try {
    calculateSize(dirPath);
  } catch (error) {
    // Ignore permission errors
  }
  
  return totalSize;
}

/**
 * Main post-build validation function
 */
async function validatePostBuild() {
  log(`${colors.bold}${colors.blue}Starting post-build validation...${colors.reset}`);
  
  try {
    validateBuildDirectory();
    validateStaticAssets();
    validateServerAssets();
    analyzeBundleSizes();
    validateBuildManifest();
    validateTypeScriptOutput();
    validateDeploymentReadiness();
    generateValidationReport();
    
    log(`${colors.bold}${colors.green}✓ Post-build validation completed successfully!${colors.reset}`);
    process.exit(0);
  } catch (error) {
    logError(`Post-build validation failed: ${error.message}`);
    
    // Generate error report
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      validation: 'failed'
    };
    
    const errorReportPath = path.join(process.cwd(), 'post-build-error.json');
    fs.writeFileSync(errorReportPath, JSON.stringify(errorReport, null, 2));
    
    log(`${colors.bold}${colors.red}✗ Post-build validation failed!${colors.reset}`);
    log(`Error report generated: ${errorReportPath}`);
    process.exit(1);
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  validatePostBuild();
}

module.exports = {
  validateBuildDirectory,
  validateStaticAssets,
  validateServerAssets,
  analyzeBundleSizes,
  validateBuildManifest,
  validateTypeScriptOutput,
  validateDeploymentReadiness,
  validatePostBuild
};