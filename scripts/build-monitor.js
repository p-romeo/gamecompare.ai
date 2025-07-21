#!/usr/bin/env node

/**
 * Build Monitor
 * Comprehensive build process monitoring with error handling and logging
 * Requirements: 3.4, 4.4, 1.4
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Import validation modules
const { validateBuildConfiguration } = require('./build-config-validator');
const { validatePostBuild } = require('./post-build-validator');

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

class BuildMonitor {
  constructor() {
    this.startTime = Date.now();
    this.logFile = path.join(process.cwd(), 'build-monitor.log');
    this.errorLog = path.join(process.cwd(), 'build-errors.log');
    this.phases = [];
    this.currentPhase = null;
    
    // Ensure log files exist
    this.initializeLogging();
  }

  /**
   * Initialize logging system
   */
  initializeLogging() {
    const logHeader = `\n=== Build Monitor Started at ${new Date().toISOString()} ===\n`;
    fs.writeFileSync(this.logFile, logHeader);
    fs.writeFileSync(this.errorLog, logHeader);
  }

  /**
   * Log message with timestamp and color
   */
  log(message, color = colors.reset, logToFile = true) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    
    console.log(`${color}${formattedMessage}${colors.reset}`);
    
    if (logToFile) {
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    }
  }

  /**
   * Log error with stack trace
   */
  logError(error, context = '') {
    const timestamp = new Date().toISOString();
    const errorMessage = `[${timestamp}] ERROR${context ? ` (${context})` : ''}: ${error.message}`;
    const stackTrace = error.stack || 'No stack trace available';
    
    console.error(`${colors.red}${errorMessage}${colors.reset}`);
    console.error(`${colors.red}${stackTrace}${colors.reset}`);
    
    fs.appendFileSync(this.errorLog, `${errorMessage}\n${stackTrace}\n\n`);
  }

  /**
   * Start a new build phase
   */
  startPhase(name, description) {
    this.currentPhase = {
      name,
      description,
      startTime: Date.now(),
      status: 'running'
    };
    
    this.log(`${colors.bold}${colors.blue}Starting Phase: ${name}${colors.reset}`, colors.blue);
    this.log(`Description: ${description}`, colors.cyan);
  }

  /**
   * Complete current build phase
   */
  completePhase(success = true, error = null) {
    if (!this.currentPhase) return;
    
    const duration = Date.now() - this.currentPhase.startTime;
    this.currentPhase.duration = duration;
    this.currentPhase.status = success ? 'completed' : 'failed';
    this.currentPhase.error = error;
    
    const status = success ? 'COMPLETED' : 'FAILED';
    const statusColor = success ? colors.green : colors.red;
    const durationFormatted = this.formatDuration(duration);
    
    this.log(`${colors.bold}${statusColor}Phase ${status}: ${this.currentPhase.name} (${durationFormatted})${colors.reset}`, statusColor);
    
    if (error) {
      this.logError(error, this.currentPhase.name);
    }
    
    this.phases.push({ ...this.currentPhase });
    this.currentPhase = null;
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
   * Execute command with monitoring
   */
  async executeCommand(command, description, options = {}) {
    this.log(`Executing: ${command}`, colors.cyan);
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      try {
        const result = execSync(command, {
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: options.timeout || 300000, // 5 minutes default
          ...options
        });
        
        const duration = Date.now() - startTime;
        this.log(`Command completed in ${this.formatDuration(duration)}`, colors.green);
        
        if (result && result.trim()) {
          this.log('Command output:', colors.cyan);
          this.log(result.trim(), colors.reset);
        }
        
        resolve(result);
      } catch (error) {
        const duration = Date.now() - startTime;
        this.log(`Command failed after ${this.formatDuration(duration)}`, colors.red);
        
        if (error.stdout) {
          this.log('Command stdout:', colors.yellow);
          this.log(error.stdout, colors.reset);
        }
        
        if (error.stderr) {
          this.log('Command stderr:', colors.red);
          this.log(error.stderr, colors.reset);
        }
        
        reject(error);
      }
    });
  }

  /**
   * Monitor system resources during build
   */
  monitorResources() {
    const startUsage = process.cpuUsage();
    const startMemory = process.memoryUsage();
    
    return {
      stop: () => {
        const endUsage = process.cpuUsage(startUsage);
        const endMemory = process.memoryUsage();
        
        const cpuUsage = {
          user: endUsage.user / 1000000, // Convert to seconds
          system: endUsage.system / 1000000
        };
        
        const memoryDelta = {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        };
        
        this.log(`CPU Usage - User: ${cpuUsage.user.toFixed(2)}s, System: ${cpuUsage.system.toFixed(2)}s`, colors.magenta);
        this.log(`Memory Delta - RSS: ${this.formatBytes(memoryDelta.rss)}, Heap: ${this.formatBytes(memoryDelta.heapUsed)}`, colors.magenta);
        
        return { cpuUsage, memoryDelta };
      }
    };
  }

  /**
   * Format bytes in human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    
    const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    const sign = bytes < 0 ? '-' : '+';
    
    return `${sign}${formatted} ${sizes[i]}`;
  }

  /**
   * Run pre-build validation
   */
  async runPreBuildValidation() {
    this.startPhase('Pre-Build Validation', 'Validating build configuration and dependencies');
    
    const resourceMonitor = this.monitorResources();
    
    try {
      // Import and run validation functions directly to avoid process.exit()
      const { 
        validatePackageJson,
        validateVercelConfig,
        validateTypeScriptConfig,
        validateNextConfig,
        validateEnvironmentConfig,
        validateBuildTools
      } = require('./build-config-validator');
      
      validatePackageJson();
      validateVercelConfig();
      validateTypeScriptConfig();
      validateNextConfig();
      validateEnvironmentConfig();
      validateBuildTools();
      
      this.log('Build configuration validation completed', colors.green);
      
      resourceMonitor.stop();
      this.completePhase(true);
    } catch (error) {
      resourceMonitor.stop();
      this.completePhase(false, error);
      throw error;
    }
  }

  /**
   * Run the actual build process
   */
  async runBuild() {
    this.startPhase('Build Process', 'Running Next.js build');
    
    const resourceMonitor = this.monitorResources();
    
    try {
      // Clean previous build
      const nextDir = path.join(process.cwd(), '.next');
      if (fs.existsSync(nextDir)) {
        this.log('Cleaning previous build...', colors.yellow);
        fs.rmSync(nextDir, { recursive: true, force: true });
      }
      
      // Run the build
      await this.executeCommand('npm run build', 'Next.js build', {
        timeout: 600000 // 10 minutes
      });
      
      resourceMonitor.stop();
      this.completePhase(true);
    } catch (error) {
      resourceMonitor.stop();
      this.completePhase(false, error);
      throw error;
    }
  }

  /**
   * Run post-build validation
   */
  async runPostBuildValidation() {
    this.startPhase('Post-Build Validation', 'Validating build output and assets');
    
    const resourceMonitor = this.monitorResources();
    
    try {
      // Import and run validation functions directly to avoid process.exit()
      const {
        validateBuildDirectory,
        validateStaticAssets,
        validateServerAssets,
        analyzeBundleSizes,
        validateBuildManifest,
        validateTypeScriptOutput,
        validateDeploymentReadiness
      } = require('./post-build-validator');
      
      validateBuildDirectory();
      validateStaticAssets();
      validateServerAssets();
      analyzeBundleSizes();
      validateBuildManifest();
      validateTypeScriptOutput();
      validateDeploymentReadiness();
      
      this.log('Post-build validation completed', colors.green);
      
      resourceMonitor.stop();
      this.completePhase(true);
    } catch (error) {
      resourceMonitor.stop();
      this.completePhase(false, error);
      throw error;
    }
  }

  /**
   * Generate comprehensive build report
   */
  generateBuildReport() {
    const totalDuration = Date.now() - this.startTime;
    const successful = this.phases.filter(phase => phase.status === 'completed').length;
    const failed = this.phases.filter(phase => phase.status === 'failed').length;
    
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: totalDuration,
      totalDurationFormatted: this.formatDuration(totalDuration),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      phases: this.phases,
      summary: {
        total: this.phases.length,
        successful,
        failed,
        success: failed === 0
      }
    };
    
    const reportPath = path.join(process.cwd(), 'build-monitor-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log(`Build report generated: ${reportPath}`, colors.green);
    
    // Log summary
    this.log(`${colors.bold}Build Summary:${colors.reset}`, colors.blue);
    this.log(`Total Duration: ${this.formatDuration(totalDuration)}`, colors.cyan);
    this.log(`Phases: ${successful} successful, ${failed} failed`, colors.cyan);
    
    if (failed === 0) {
      this.log(`${colors.bold}${colors.green}✓ Build completed successfully!${colors.reset}`, colors.green);
    } else {
      this.log(`${colors.bold}${colors.red}✗ Build failed with ${failed} phase(s) failing${colors.reset}`, colors.red);
    }
    
    return report;
  }

  /**
   * Main build monitoring function
   */
  async monitor() {
    this.log(`${colors.bold}${colors.blue}Starting Build Monitor...${colors.reset}`, colors.blue);
    this.log(`Node.js: ${process.version}`, colors.cyan);
    this.log(`Platform: ${process.platform} ${process.arch}`, colors.cyan);
    this.log(`Working Directory: ${process.cwd()}`, colors.cyan);
    
    try {
      await this.runPreBuildValidation();
      await this.runBuild();
      await this.runPostBuildValidation();
      
      const report = this.generateBuildReport();
      process.exit(0);
    } catch (error) {
      this.logError(error, 'Build Monitor');
      this.generateBuildReport();
      process.exit(1);
    }
  }
}

// Run monitoring if this script is executed directly
if (require.main === module) {
  const monitor = new BuildMonitor();
  monitor.monitor();
}

module.exports = BuildMonitor;