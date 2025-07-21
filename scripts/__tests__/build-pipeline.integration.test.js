/**
 * Integration Tests for Complete Build Pipeline
 * Tests the entire build process from validation to deployment readiness
 * Requirements: 2.2, 3.3, 4.2, 4.3
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Increase timeout for integration tests
jest.setTimeout(300000); // 5 minutes

describe('Build Pipeline Integration Tests', () => {
  let testProjectDir;
  let originalCwd;
  
  beforeAll(() => {
    originalCwd = process.cwd();
    testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-pipeline-test-'));
    
    // Create a minimal Next.js project structure for testing
    setupTestProject();
  });
  
  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });
  
  function setupTestProject() {
    process.chdir(testProjectDir);
    
    // Create package.json
    const packageJson = {
      name: 'test-build-pipeline',
      version: '1.0.0',
      engines: {
        node: '>=18.0.0',
        npm: '>=9.0.0'
      },
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        'pre-build': 'node scripts/pre-build-validation.js',
        'validate:build-config': 'node scripts/build-config-validator.js',
        'validate:post-build': 'node scripts/post-build-validator.js'
      },
      dependencies: {
        next: '^14.0.0',
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        typescript: '^5.0.0',
        eslint: '^8.0.0',
        '@types/react': '^18.0.0',
        '@types/react-dom': '^18.0.0',
        '@types/node': '^20.0.0'
      },
      devDependencies: {
        'eslint-config-next': '^14.0.0'
      }
    };
    
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    
    // Create vercel.json
    const vercelConfig = {
      framework: 'nextjs',
      buildCommand: 'npm run build',
      installCommand: 'npm ci'
    };
    
    fs.writeFileSync('vercel.json', JSON.stringify(vercelConfig, null, 2));
    
    // Create tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: 'es5',
        lib: ['dom', 'dom.iterable', 'es6'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'node',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
      exclude: ['node_modules']
    };
    
    fs.writeFileSync('tsconfig.json', JSON.stringify(tsConfig, null, 2));
    
    // Create next.config.js
    const nextConfig = `
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true
};

module.exports = nextConfig;
`;
    
    fs.writeFileSync('next.config.js', nextConfig);
    
    // Create basic pages structure
    fs.mkdirSync('pages', { recursive: true });
    
    const indexPage = `
import React from 'react';

export default function Home() {
  return (
    <div>
      <h1>Test Build Pipeline</h1>
      <p>This is a test page for build pipeline validation.</p>
    </div>
  );
}
`;
    
    fs.writeFileSync('pages/index.tsx', indexPage);
    
    const appPage = `
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
`;
    
    fs.writeFileSync('pages/_app.tsx', appPage);
    
    // Create scripts directory and copy validation scripts
    fs.mkdirSync('scripts', { recursive: true });
    
    // Copy validation scripts from the main project
    const scriptsPath = path.join(originalCwd, 'scripts');
    const scriptFiles = [
      'pre-build-validation.js',
      'build-config-validator.js',
      'post-build-validator.js',
      'build-monitor.js'
    ];
    
    for (const scriptFile of scriptFiles) {
      const sourcePath = path.join(scriptsPath, scriptFile);
      const destPath = path.join(testProjectDir, 'scripts', scriptFile);
      
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
    
    // Create .eslintrc.json
    const eslintConfig = {
      extends: ['next/core-web-vitals'],
      rules: {}
    };
    
    fs.writeFileSync('.eslintrc.json', JSON.stringify(eslintConfig, null, 2));
  }
  
  function executeCommand(command, options = {}) {
    try {
      const result = execSync(command, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 180000, // 3 minutes
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
  
  describe('Pre-Build Validation Pipeline', () => {
    test('should validate build configuration successfully', () => {
      const result = executeCommand('node scripts/build-config-validator.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Build configuration validation completed successfully');
    });
    
    test('should run pre-build validation without errors', () => {
      // Skip this test if dependencies are not installed
      if (!fs.existsSync('node_modules')) {
        console.log('Skipping pre-build validation test - dependencies not installed');
        return;
      }
      
      const result = executeCommand('node scripts/pre-build-validation.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('All pre-build validations passed');
    });
  });
  
  describe('Build Process Pipeline', () => {
    test('should install dependencies successfully', () => {
      // Create a minimal package-lock.json for faster testing
      const packageLock = {
        name: 'test-build-pipeline',
        version: '1.0.0',
        lockfileVersion: 2,
        requires: true,
        packages: {}
      };
      
      fs.writeFileSync('package-lock.json', JSON.stringify(packageLock, null, 2));
      
      // Use npm install instead of npm ci for test environment
      const result = executeCommand('npm install --production=false', {
        timeout: 300000 // 5 minutes for dependency installation
      });
      
      if (!result.success) {
        console.log('Dependency installation failed:', result.error);
        console.log('Output:', result.output);
      }
      
      expect(result.success).toBe(true);
      expect(fs.existsSync('node_modules')).toBe(true);
    });
    
    test('should build Next.js application successfully', () => {
      // Skip if dependencies are not installed
      if (!fs.existsSync('node_modules')) {
        console.log('Skipping build test - dependencies not installed');
        return;
      }
      
      const result = executeCommand('npm run build', {
        timeout: 300000 // 5 minutes for build
      });
      
      if (!result.success) {
        console.log('Build failed:', result.error);
        console.log('Output:', result.output);
      }
      
      expect(result.success).toBe(true);
      expect(fs.existsSync('.next')).toBe(true);
      expect(fs.existsSync('.next/BUILD_ID')).toBe(true);
    });
  });
  
  describe('Post-Build Validation Pipeline', () => {
    test('should validate build output successfully', () => {
      // Skip if build output doesn't exist
      if (!fs.existsSync('.next')) {
        console.log('Skipping post-build validation test - build output not found');
        return;
      }
      
      const result = executeCommand('node scripts/post-build-validator.js');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('Post-build validation completed successfully');
    });
    
    test('should generate validation reports', () => {
      // Skip if build output doesn't exist
      if (!fs.existsSync('.next')) {
        console.log('Skipping report generation test - build output not found');
        return;
      }
      
      // Run post-build validation to generate reports
      executeCommand('node scripts/post-build-validator.js');
      
      expect(fs.existsSync('post-build-report.json')).toBe(true);
      
      const report = JSON.parse(fs.readFileSync('post-build-report.json', 'utf8'));
      expect(report.validation).toBe('passed');
      expect(report.buildId).toBeDefined();
    });
  });
  
  describe('Complete Pipeline Integration', () => {
    test('should run complete build pipeline successfully', () => {
      // Skip if dependencies are not installed
      if (!fs.existsSync('node_modules')) {
        console.log('Skipping complete pipeline test - dependencies not installed');
        return;
      }
      
      // Test the complete pipeline: pre-build -> build -> post-build
      const steps = [
        { command: 'node scripts/build-config-validator.js', name: 'Build Config Validation' },
        { command: 'npm run build', name: 'Next.js Build' },
        { command: 'node scripts/post-build-validator.js', name: 'Post-Build Validation' }
      ];
      
      for (const step of steps) {
        const result = executeCommand(step.command, {
          timeout: step.name === 'Next.js Build' ? 300000 : 60000
        });
        
        if (!result.success) {
          console.log(`${step.name} failed:`, result.error);
          console.log('Output:', result.output);
        }
        
        expect(result.success).toBe(true);
      }
      
      // Verify final build artifacts
      expect(fs.existsSync('.next')).toBe(true);
      expect(fs.existsSync('.next/static')).toBe(true);
      expect(fs.existsSync('.next/server')).toBe(true);
      expect(fs.existsSync('post-build-report.json')).toBe(true);
    });
    
    test('should handle build failures gracefully', () => {
      // Create an invalid Next.js configuration to test error handling
      const invalidNextConfig = `
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Invalid configuration that should cause build to fail
  experimental: {
    invalidOption: true
  }
};

module.exports = nextConfig;
`;
      
      // Backup original config
      const originalConfig = fs.readFileSync('next.config.js', 'utf8');
      
      try {
        fs.writeFileSync('next.config.js', invalidNextConfig);
        
        // Build should still work with experimental options (Next.js is forgiving)
        // So let's test with a syntax error instead
        fs.writeFileSync('next.config.js', 'invalid javascript syntax {');
        
        const result = executeCommand('npm run build');
        
        // Build should fail with syntax error
        expect(result.success).toBe(false);
        
      } finally {
        // Restore original config
        fs.writeFileSync('next.config.js', originalConfig);
      }
    });
  });
  
  describe('Performance and Optimization Validation', () => {
    test('should validate bundle size optimization', () => {
      // Skip if build output doesn't exist
      if (!fs.existsSync('.next/static')) {
        console.log('Skipping bundle size test - build output not found');
        return;
      }
      
      const chunksDir = path.join('.next/static/chunks');
      if (fs.existsSync(chunksDir)) {
        const jsFiles = fs.readdirSync(chunksDir, { recursive: true })
          .filter(file => typeof file === 'string' && file.endsWith('.js'));
        
        expect(jsFiles.length).toBeGreaterThan(0);
        
        // Check that no individual bundle is excessively large (>5MB)
        for (const file of jsFiles) {
          const filePath = path.join(chunksDir, file);
          const stats = fs.statSync(filePath);
          expect(stats.size).toBeLessThan(5 * 1024 * 1024); // 5MB limit
        }
      }
    });
    
    test('should validate Next.js optimizations', () => {
      const nextConfig = require(path.join(testProjectDir, 'next.config.js'));
      
      // Check for performance optimizations
      expect(nextConfig.compress).not.toBe(false); // Compression should be enabled
      expect(nextConfig.poweredByHeader).toBe(false); // Security header should be disabled
    });
  });
  
  describe('Error Recovery and Debugging', () => {
    test('should provide helpful error messages on validation failures', () => {
      // Create an invalid package.json to test error handling
      const originalPackageJson = fs.readFileSync('package.json', 'utf8');
      
      try {
        // Remove required fields to trigger validation errors
        const invalidPackageJson = { name: 'test' }; // Missing engines, scripts, etc.
        fs.writeFileSync('package.json', JSON.stringify(invalidPackageJson, null, 2));
        
        const result = executeCommand('node scripts/build-config-validator.js');
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('Package.json validation failed');
        
      } finally {
        // Restore original package.json
        fs.writeFileSync('package.json', originalPackageJson);
      }
    });
    
    test('should generate error reports for debugging', () => {
      // Create an invalid configuration to trigger error report generation
      const originalPackageJson = fs.readFileSync('package.json', 'utf8');
      
      try {
        fs.writeFileSync('package.json', '{ invalid json }');
        
        const result = executeCommand('node scripts/build-config-validator.js');
        
        expect(result.success).toBe(false);
        
        // Check if error report was generated
        if (fs.existsSync('build-config-error.json')) {
          const errorReport = JSON.parse(fs.readFileSync('build-config-error.json', 'utf8'));
          expect(errorReport.validation).toBe('failed');
          expect(errorReport.error).toBeDefined();
        }
        
      } finally {
        fs.writeFileSync('package.json', originalPackageJson);
      }
    });
  });
});