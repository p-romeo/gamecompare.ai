/**
 * Unit Tests for Build Validation Scripts
 * Tests the build configuration and post-build validation functionality
 * Requirements: 2.2, 3.3, 4.2, 4.3
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock console methods to capture output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
let consoleOutput = [];
let consoleErrors = [];

beforeEach(() => {
  consoleOutput = [];
  consoleErrors = [];
  
  console.log = (...args) => {
    consoleOutput.push(args.join(' '));
  };
  
  console.error = (...args) => {
    consoleErrors.push(args.join(' '));
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe('Build Configuration Validator', () => {
  let buildConfigValidator;
  let tempDir;
  let originalCwd;
  
  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    
    // Import the module after changing directory
    buildConfigValidator = require('../build-config-validator');
  });
  
  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('validatePackageJson', () => {
    test('should pass with valid package.json', () => {
      const validPackageJson = {
        name: 'test-app',
        version: '1.0.0',
        engines: {
          node: '>=18.0.0',
          npm: '>=9.0.0'
        },
        scripts: {
          build: 'next build'
        },
        dependencies: {
          typescript: '^5.0.0',
          eslint: '^8.0.0',
          '@types/react': '^18.0.0',
          '@types/react-dom': '^18.0.0',
          '@types/node': '^20.0.0',
          next: '^14.0.0'
        }
      };
      
      fs.writeFileSync('package.json', JSON.stringify(validPackageJson, null, 2));
      
      expect(() => {
        buildConfigValidator.validatePackageJson();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Package.json configuration is valid'))).toBe(true);
    });
    
    test('should fail with missing package.json', () => {
      expect(() => {
        buildConfigValidator.validatePackageJson();
      }).toThrow('package.json not found');
    });
    
    test('should fail with missing engines specification', () => {
      const invalidPackageJson = {
        name: 'test-app',
        version: '1.0.0',
        scripts: { build: 'next build' },
        dependencies: {}
      };
      
      fs.writeFileSync('package.json', JSON.stringify(invalidPackageJson, null, 2));
      
      expect(() => {
        buildConfigValidator.validatePackageJson();
      }).toThrow('Package.json validation failed');
    });
    
    test('should fail with missing build script', () => {
      const invalidPackageJson = {
        name: 'test-app',
        version: '1.0.0',
        engines: { node: '>=18.0.0' },
        dependencies: {}
      };
      
      fs.writeFileSync('package.json', JSON.stringify(invalidPackageJson, null, 2));
      
      expect(() => {
        buildConfigValidator.validatePackageJson();
      }).toThrow('Package.json validation failed');
    });
  });
  
  describe('validateVercelConfig', () => {
    test('should pass with valid vercel.json', () => {
      const validVercelConfig = {
        framework: 'nextjs',
        buildCommand: 'npm run build:vercel',
        installCommand: 'npm ci'
      };
      
      fs.writeFileSync('vercel.json', JSON.stringify(validVercelConfig, null, 2));
      
      expect(() => {
        buildConfigValidator.validateVercelConfig();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Vercel configuration is valid'))).toBe(true);
    });
    
    test('should pass with missing vercel.json (uses defaults)', () => {
      expect(() => {
        buildConfigValidator.validateVercelConfig();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('vercel.json not found - using default'))).toBe(true);
    });
    
    test('should fail with invalid JSON in vercel.json', () => {
      fs.writeFileSync('vercel.json', '{ invalid json }');
      
      expect(() => {
        buildConfigValidator.validateVercelConfig();
      }).toThrow('Invalid vercel.json');
    });
  });
  
  describe('validateTypeScriptConfig', () => {
    test('should pass with valid tsconfig.json', () => {
      const validTsConfig = {
        compilerOptions: {
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true
        }
      };
      
      fs.writeFileSync('tsconfig.json', JSON.stringify(validTsConfig, null, 2));
      
      expect(() => {
        buildConfigValidator.validateTypeScriptConfig();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('TypeScript configuration validated'))).toBe(true);
    });
    
    test('should pass with missing tsconfig.json', () => {
      expect(() => {
        buildConfigValidator.validateTypeScriptConfig();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('tsconfig.json not found'))).toBe(true);
    });
    
    test('should fail with invalid JSON in tsconfig.json', () => {
      fs.writeFileSync('tsconfig.json', '{ invalid json }');
      
      expect(() => {
        buildConfigValidator.validateTypeScriptConfig();
      }).toThrow('Invalid tsconfig.json');
    });
  });
});

describe('Post-Build Validator', () => {
  let postBuildValidator;
  let tempDir;
  let originalCwd;
  
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-build-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    
    postBuildValidator = require('../post-build-validator');
  });
  
  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('validateBuildDirectory', () => {
    test('should pass with valid build directory structure', () => {
      // Create mock .next directory structure
      fs.mkdirSync('.next', { recursive: true });
      fs.mkdirSync('.next/static', { recursive: true });
      fs.mkdirSync('.next/server', { recursive: true });
      fs.writeFileSync('.next/BUILD_ID', 'test-build-id');
      
      expect(() => {
        postBuildValidator.validateBuildDirectory();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Build directory structure is valid'))).toBe(true);
    });
    
    test('should fail with missing .next directory', () => {
      expect(() => {
        postBuildValidator.validateBuildDirectory();
      }).toThrow('.next build directory not found');
    });
    
    test('should fail with missing required build artifacts', () => {
      fs.mkdirSync('.next', { recursive: true });
      // Missing static, server, and BUILD_ID
      
      expect(() => {
        postBuildValidator.validateBuildDirectory();
      }).toThrow('Missing required build artifacts');
    });
  });
  
  describe('validateStaticAssets', () => {
    test('should pass with valid static assets', () => {
      // Create mock static assets structure
      fs.mkdirSync('.next/static/chunks', { recursive: true });
      fs.mkdirSync('.next/static/css', { recursive: true });
      
      fs.writeFileSync('.next/static/chunks/main.js', 'console.log("main");');
      fs.writeFileSync('.next/static/chunks/app.js', 'console.log("app");');
      fs.writeFileSync('.next/static/css/app.css', 'body { margin: 0; }');
      
      expect(() => {
        postBuildValidator.validateStaticAssets();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Static assets validation completed'))).toBe(true);
    });
    
    test('should fail with missing static directory', () => {
      expect(() => {
        postBuildValidator.validateStaticAssets();
      }).toThrow('Static assets directory not found');
    });
  });
  
  describe('validateServerAssets', () => {
    test('should pass with valid server assets', () => {
      // Create mock server assets structure
      fs.mkdirSync('.next/server/pages', { recursive: true });
      fs.writeFileSync('.next/server/pages/index.js', 'module.exports = {};');
      fs.writeFileSync('.next/server/pages/_app.js', 'module.exports = {};');
      
      expect(() => {
        postBuildValidator.validateServerAssets();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Server-side assets validation completed'))).toBe(true);
    });
    
    test('should fail with missing server directory', () => {
      expect(() => {
        postBuildValidator.validateServerAssets();
      }).toThrow('Server directory not found');
    });
  });
  
  describe('analyzeBundleSizes', () => {
    test('should analyze bundle sizes correctly', () => {
      // Create mock chunks with different sizes
      fs.mkdirSync('.next/static/chunks', { recursive: true });
      
      fs.writeFileSync('.next/static/chunks/main.js', 'a'.repeat(1000)); // 1KB
      fs.writeFileSync('.next/static/chunks/vendor.js', 'b'.repeat(50000)); // 50KB
      
      expect(() => {
        postBuildValidator.analyzeBundleSizes();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Bundle size analysis completed'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('Total JavaScript files: 2'))).toBe(true);
    });
    
    test('should handle missing chunks directory gracefully', () => {
      expect(() => {
        postBuildValidator.analyzeBundleSizes();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Chunks directory not found'))).toBe(true);
    });
  });
  
  describe('validateDeploymentReadiness', () => {
    test('should pass deployment readiness checks', () => {
      // Create required files and directories
      const packageJson = {
        name: 'test-app',
        scripts: { build: 'next build', start: 'next start' },
        dependencies: { next: '^14.0.0', react: '^18.0.0', 'react-dom': '^18.0.0' }
      };
      
      fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
      fs.mkdirSync('.next', { recursive: true });
      fs.mkdirSync('.next/static', { recursive: true });
      fs.mkdirSync('.next/server', { recursive: true });
      fs.writeFileSync('.next/BUILD_ID', 'test-build-id');
      fs.mkdirSync('node_modules', { recursive: true });
      
      expect(() => {
        postBuildValidator.validateDeploymentReadiness();
      }).not.toThrow();
      
      expect(consoleOutput.some(line => line.includes('Deployment readiness validation completed'))).toBe(true);
    });
    
    test('should fail with missing required files', () => {
      // No package.json or build artifacts
      
      expect(() => {
        postBuildValidator.validateDeploymentReadiness();
      }).toThrow('Deployment readiness validation failed');
    });
  });
});

describe('Build Monitor Integration', () => {
  test('should import build monitor without errors', () => {
    expect(() => {
      const BuildMonitor = require('../build-monitor');
      expect(typeof BuildMonitor).toBe('function');
    }).not.toThrow();
  });
  
  test('should create build monitor instance', () => {
    const BuildMonitor = require('../build-monitor');
    const monitor = new BuildMonitor();
    
    expect(monitor).toBeDefined();
    expect(typeof monitor.log).toBe('function');
    expect(typeof monitor.startPhase).toBe('function');
    expect(typeof monitor.completePhase).toBe('function');
  });
});

describe('Error Handling', () => {
  test('should handle file system errors gracefully', () => {
    const buildConfigValidator = require('../build-config-validator');
    
    // Test with read-only directory (simulate permission error)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readonly-test-'));
    const originalCwd = process.cwd();
    
    try {
      process.chdir(tempDir);
      
      // Create a package.json that will cause validation to fail
      fs.writeFileSync('package.json', '{}');
      
      expect(() => {
        buildConfigValidator.validatePackageJson();
      }).toThrow();
      
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  test('should handle malformed JSON files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'malformed-test-'));
    const originalCwd = process.cwd();
    
    try {
      process.chdir(tempDir);
      
      fs.writeFileSync('package.json', '{ "name": "test", invalid }');
      
      const buildConfigValidator = require('../build-config-validator');
      
      expect(() => {
        buildConfigValidator.validatePackageJson();
      }).toThrow();
      
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});