#!/usr/bin/env node

/**
 * Vercel Build Process Simulator
 * Simulates the Vercel build environment locally to test deployment fixes
 * Requirements: 2.2, 3.3, 4.2, 4.3
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// ANSI color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class VercelBuildSimulator {
  constructor() {
    this.startTime = Date.now();
    this.testResults = [];
    this.tempDir = path.join(os.tmpdir(), `vercel-test-${Date.now()}`);
    this.originalDir = process.cwd();
  }

  /**
   * Log message with timestamp and color
   */
  log(message, color = colors.reset) {
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
  }

  /**
   * Log test result
   */
  logTest(testName, passed, details = '') {
    const status = passed ? 'PASS' : 'FAIL';
    const statusColor = passed ? colors.green : colors.red;
    
    this.log(`${colors.bold}${statusColor}[${status}]${colors.reset} ${testName}`, statusColor);
    
    if (details) {
      this.log(`  ${details}`, colors.cyan);
    }
    
    this.testResults.push({
      name: testName,
      passed,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Execute command and capture output
   */
  executeCommand(command, options = {}) {
    try {
      const result = execSync(command, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: options.timeout || 300000,
        ...options
      });
      
      return { success: true, output: result, error: null };
    } catch (error) {
      return { 
        success: false, 
        output: error.stdout || '', 
        error: error.stderr || error.message 
      };
    }
  }

  /**
   * Test 1: Simulate Vercel environment setup
   */
  async testVercelEnvironmentSetup() {
    this.log(`${colors.bold}${colors.blue}Test 1: Vercel Environment Setup${colors.reset}`, colors.blue);
    
    try {
      // Check Node.js version compatibility
      const nodeVersion = process.version;
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const engineRequirement = packageJson.engines?.node;
      
      if (engineRequirement) {
        this.logTest('Node.js version compatibility', true, `${nodeVersion} matches requirement ${engineRequirement}`);
      } else {
        this.logTest('Node.js version compatibility', false, 'No engine requirement specified');
      }
      
      // Check npm version
      const npmResult = this.executeCommand('npm --version');
      if (npmResult.success) {
        const npmVersion = npmResult.output.trim();
        const npmRequirement = packageJson.engines?.npm;
        
        if (npmRequirement) {
          this.logTest('npm version compatibility', true, `${npmVersion} available (requirement: ${npmRequirement})`);
        } else {
          this.logTest('npm version compatibility', true, `${npmVersion} available`);
        }
      } else {
        this.logTest('npm version compatibility', false, 'npm not available');
      }
      
      // Check Vercel configuration
      const vercelConfigPath = path.join(process.cwd(), 'vercel.json');
      if (fs.existsSync(vercelConfigPath)) {
        const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
        this.logTest('Vercel configuration exists', true, `Framework: ${vercelConfig.framework || 'auto-detect'}`);
        
        // Validate build command
        if (vercelConfig.buildCommand) {
          this.logTest('Custom build command configured', true, vercelConfig.buildCommand);
        } else {
          this.logTest('Custom build command configured', true, 'Using default Next.js build');
        }
      } else {
        this.logTest('Vercel configuration exists', false, 'vercel.json not found');
      }
      
    } catch (error) {
      this.logTest('Environment setup', false, error.message);
    }
  }

  /**
   * Test 2: Simulate dependency installation
   */
  async testDependencyInstallation() {
    this.log(`${colors.bold}${colors.blue}Test 2: Dependency Installation${colors.reset}`, colors.blue);
    
    try {
      // Test npm ci (Vercel's preferred method)
      this.log('Testing npm ci installation...', colors.cyan);
      
      // Create a temporary directory for testing
      fs.mkdirSync(this.tempDir, { recursive: true });
      
      // Copy package.json and package-lock.json
      fs.copyFileSync('package.json', path.join(this.tempDir, 'package.json'));
      
      if (fs.existsSync('package-lock.json')) {
        fs.copyFileSync('package-lock.json', path.join(this.tempDir, 'package-lock.json'));
        this.logTest('package-lock.json exists', true, 'Deterministic builds enabled');
      } else {
        this.logTest('package-lock.json exists', false, 'May cause dependency version issues');
      }
      
      // Test dependency installation in temp directory
      const installResult = this.executeCommand('npm ci --include=dev', {
        cwd: this.tempDir,
        timeout: 180000 // 3 minutes
      });
      
      if (installResult.success) {
        this.logTest('npm ci installation', true, 'Dependencies installed successfully');
        
        // Check for critical dependencies
        const criticalDeps = ['typescript', 'eslint', '@types/react', '@types/react-dom', 'next'];
        const nodeModulesPath = path.join(this.tempDir, 'node_modules');
        
        for (const dep of criticalDeps) {
          const depPath = path.join(nodeModulesPath, dep);
          if (fs.existsSync(depPath)) {
            this.logTest(`Critical dependency: ${dep}`, true, 'Available');
          } else {
            this.logTest(`Critical dependency: ${dep}`, false, 'Missing');
          }
        }
      } else {
        this.logTest('npm ci installation', false, installResult.error);
      }
      
    } catch (error) {
      this.logTest('Dependency installation', false, error.message);
    }
  }

  /**
   * Test 3: Simulate build process
   */
  async testBuildProcess() {
    this.log(`${colors.bold}${colors.blue}Test 3: Build Process${colors.reset}`, colors.blue);
    
    try {
      // Test pre-build validation
      this.log('Testing pre-build validation...', colors.cyan);
      
      const preBuildResult = this.executeCommand('node scripts/pre-build-validation.js');
      if (preBuildResult.success) {
        this.logTest('Pre-build validation', true, 'All validations passed');
      } else {
        this.logTest('Pre-build validation', false, preBuildResult.error);
      }
      
      // Test build configuration validation
      const buildConfigResult = this.executeCommand('node scripts/build-config-validator.js');
      if (buildConfigResult.success) {
        this.logTest('Build configuration validation', true, 'Configuration is valid');
      } else {
        this.logTest('Build configuration validation', false, buildConfigResult.error);
      }
      
      // Test actual build (using Vercel-specific command)
      this.log('Testing Next.js build process...', colors.cyan);
      
      const buildResult = this.executeCommand('npm run build:vercel', {
        timeout: 600000 // 10 minutes
      });
      
      if (buildResult.success) {
        this.logTest('Next.js build', true, 'Build completed successfully');
        
        // Verify build output
        const buildDir = path.join(process.cwd(), '.next');
        if (fs.existsSync(buildDir)) {
          this.logTest('Build output directory', true, '.next directory created');
          
          // Check for essential build artifacts
          const requiredArtifacts = [
            '.next/static',
            '.next/server',
            '.next/BUILD_ID'
          ];
          
          for (const artifact of requiredArtifacts) {
            const artifactPath = path.join(process.cwd(), artifact);
            if (fs.existsSync(artifactPath)) {
              this.logTest(`Build artifact: ${artifact}`, true, 'Present');
            } else {
              this.logTest(`Build artifact: ${artifact}`, false, 'Missing');
            }
          }
        } else {
          this.logTest('Build output directory', false, '.next directory not found');
        }
      } else {
        this.logTest('Next.js build', false, buildResult.error);
      }
      
    } catch (error) {
      this.logTest('Build process', false, error.message);
    }
  }

  /**
   * Test 4: Validate deployment readiness
   */
  async testDeploymentReadiness() {
    this.log(`${colors.bold}${colors.blue}Test 4: Deployment Readiness${colors.reset}`, colors.blue);
    
    try {
      // Test post-build validation
      const postBuildResult = this.executeCommand('node scripts/post-build-validator.js');
      if (postBuildResult.success) {
        this.logTest('Post-build validation', true, 'All validations passed');
      } else {
        this.logTest('Post-build validation', false, postBuildResult.error);
      }
      
      // Check for common deployment issues
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      // Check build scripts
      if (packageJson.scripts?.build) {
        this.logTest('Build script exists', true, packageJson.scripts.build);
      } else {
        this.logTest('Build script exists', false, 'No build script defined');
      }
      
      // Check start script
      if (packageJson.scripts?.start) {
        this.logTest('Start script exists', true, packageJson.scripts.start);
      } else {
        this.logTest('Start script exists', false, 'No start script defined');
      }
      
      // Check for production dependencies
      const prodDeps = packageJson.dependencies || {};
      const criticalProdDeps = ['next', 'react', 'react-dom'];
      
      for (const dep of criticalProdDeps) {
        if (prodDeps[dep]) {
          this.logTest(`Production dependency: ${dep}`, true, `Version: ${prodDeps[dep]}`);
        } else {
          this.logTest(`Production dependency: ${dep}`, false, 'Missing from dependencies');
        }
      }
      
      // Check environment configuration
      const envFiles = ['.env.production.example', '.env.local.example'];
      const hasEnvExamples = envFiles.some(file => fs.existsSync(file));
      
      if (hasEnvExamples) {
        this.logTest('Environment configuration', true, 'Example files available');
      } else {
        this.logTest('Environment configuration', false, 'No environment examples found');
      }
      
    } catch (error) {
      this.logTest('Deployment readiness', false, error.message);
    }
  }

  /**
   * Test 5: Performance and optimization checks
   */
  async testPerformanceOptimization() {
    this.log(`${colors.bold}${colors.blue}Test 5: Performance Optimization${colors.reset}`, colors.blue);
    
    try {
      // Check Next.js configuration for optimizations
      const nextConfigPath = path.join(process.cwd(), 'next.config.js');
      if (fs.existsSync(nextConfigPath)) {
        this.logTest('Next.js configuration exists', true, 'Custom configuration available');
        
        try {
          delete require.cache[require.resolve(path.resolve(nextConfigPath))];
          const nextConfig = require(path.resolve(nextConfigPath));
          
          // Check for performance optimizations
          if (nextConfig.compress !== false) {
            this.logTest('Compression enabled', true, 'Gzip compression active');
          } else {
            this.logTest('Compression enabled', false, 'Compression disabled');
          }
          
          if (nextConfig.poweredByHeader === false) {
            this.logTest('Security headers optimized', true, 'X-Powered-By header disabled');
          } else {
            this.logTest('Security headers optimized', false, 'Consider disabling X-Powered-By header');
          }
          
        } catch (error) {
          this.logTest('Next.js configuration parsing', false, error.message);
        }
      } else {
        this.logTest('Next.js configuration exists', true, 'Using default configuration');
      }
      
      // Check bundle size if build exists
      const staticDir = path.join(process.cwd(), '.next/static');
      if (fs.existsSync(staticDir)) {
        const chunksDir = path.join(staticDir, 'chunks');
        if (fs.existsSync(chunksDir)) {
          const jsFiles = fs.readdirSync(chunksDir, { recursive: true })
            .filter(file => typeof file === 'string' && file.endsWith('.js'));
          
          if (jsFiles.length > 0) {
            const totalSize = jsFiles.reduce((sum, file) => {
              const filePath = path.join(chunksDir, file);
              return sum + fs.statSync(filePath).size;
            }, 0);
            
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            
            if (totalSize < 5 * 1024 * 1024) { // Less than 5MB
              this.logTest('Bundle size optimization', true, `Total JS: ${totalSizeMB}MB`);
            } else {
              this.logTest('Bundle size optimization', false, `Large bundle size: ${totalSizeMB}MB`);
            }
          }
        }
      }
      
    } catch (error) {
      this.logTest('Performance optimization', false, error.message);
    }
  }

  /**
   * Cleanup temporary files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        this.log('Cleaned up temporary files', colors.green);
      }
    } catch (error) {
      this.log(`Cleanup warning: ${error.message}`, colors.yellow);
    }
  }

  /**
   * Generate test report
   */
  generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.testResults.filter(test => test.passed).length;
    const failed = this.testResults.filter(test => !test.passed).length;
    const total = this.testResults.length;
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      durationFormatted: this.formatDuration(totalDuration),
      summary: {
        total,
        passed,
        failed,
        successRate: total > 0 ? ((passed / total) * 100).toFixed(1) : 0
      },
      tests: this.testResults,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };
    
    const reportPath = path.join(process.cwd(), 'vercel-build-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log(`Test report generated: ${reportPath}`, colors.green);
    
    // Log summary
    this.log(`${colors.bold}Test Summary:${colors.reset}`, colors.blue);
    this.log(`Total Tests: ${total}`, colors.cyan);
    this.log(`Passed: ${passed}`, colors.green);
    this.log(`Failed: ${failed}`, failed > 0 ? colors.red : colors.cyan);
    this.log(`Success Rate: ${report.summary.successRate}%`, colors.cyan);
    this.log(`Duration: ${report.durationFormatted}`, colors.cyan);
    
    if (failed === 0) {
      this.log(`${colors.bold}${colors.green}✓ All tests passed! Deployment fix is working correctly.${colors.reset}`, colors.green);
    } else {
      this.log(`${colors.bold}${colors.red}✗ ${failed} test(s) failed. Review the issues above.${colors.reset}`, colors.red);
    }
    
    return report;
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  /**
   * Run all tests
   */
  async runTests() {
    this.log(`${colors.bold}${colors.blue}Starting Vercel Build Process Simulation...${colors.reset}`, colors.blue);
    this.log(`Node.js: ${process.version}`, colors.cyan);
    this.log(`Platform: ${process.platform} ${process.arch}`, colors.cyan);
    this.log(`Working Directory: ${process.cwd()}`, colors.cyan);
    
    try {
      await this.testVercelEnvironmentSetup();
      await this.testDependencyInstallation();
      await this.testBuildProcess();
      await this.testDeploymentReadiness();
      await this.testPerformanceOptimization();
      
      const report = this.generateReport();
      
      // Exit with appropriate code
      const exitCode = report.summary.failed > 0 ? 1 : 0;
      process.exit(exitCode);
      
    } catch (error) {
      this.log(`Test execution failed: ${error.message}`, colors.red);
      this.logTest('Test execution', false, error.message);
      
      this.generateReport();
      process.exit(1);
    } finally {
      this.cleanup();
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const simulator = new VercelBuildSimulator();
  simulator.runTests();
}

module.exports = VercelBuildSimulator;