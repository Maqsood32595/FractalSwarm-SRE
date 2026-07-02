import fs from 'fs';
import path from 'path';
import express, { Express, Router } from 'express';

interface FeatureManifest {
  name: string;
  id: string;
  slug: string;
  version: string;
  basePath: string;
  description: string;
  routes?: string;
  publicDir?: string;
}

interface MountedFeature {
  manifest: FeatureManifest;
  path: string;
  mountedAt: Date;
}

function findFiles(dir: string, fileName: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, fileName));
    } else if (file === fileName) {
      results.push(fullPath);
    }
  });
  return results;
}

function clearFeatureCache(dirPath: string): void {
  const absoluteDirPath = path.resolve(dirPath);
  Object.keys(require.cache).forEach((key) => {
    if (key.startsWith(absoluteDirPath)) {
      console.log(`[Fractal Kernel] Cleared require.cache for: ${key}`);
      delete require.cache[key];
    }
  });
}

export class FractalKernel {
  private app: Express;
  private featuresDir: string;
  public loadedFeatures: Map<string, MountedFeature>;

  constructor(app: Express) {
    this.app = app;
    this.featuresDir = path.join(__dirname, 'features');
    this.loadedFeatures = new Map();
  }

  async boot(): Promise<void> {
    console.log('[Fractal Kernel] Initiating auto-discovery in:', this.featuresDir);
    const manifests = findFiles(this.featuresDir, 'feature.manifest.json');
    console.log(`[Fractal Kernel] Found ${manifests.length} feature manifest(s).`);

    for (const manifestPath of manifests) {
      try {
        await this.mountFeature(manifestPath);
      } catch (err) {
        console.error(`[Fractal Kernel] Failed to mount feature at ${manifestPath}:`, err);
      }
    }
  }

  async mountFeature(manifestPath: string): Promise<void> {
    const featureDir = path.dirname(manifestPath);
    
    // 1. Read manifest configuration
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest: FeatureManifest = JSON.parse(manifestContent);

    console.log(`\n[Fractal Kernel] Mounting Feature: "${manifest.name}" (v${manifest.version})`);
    console.log(`  └─ ID: ${manifest.id}`);
    console.log(`  └─ Base Path: ${manifest.basePath}`);
    console.log(`  └─ Path: ${featureDir}`);

    // 2. Perform clean-room cache clearing
    clearFeatureCache(featureDir);

    // 3. Resolve and mount routes
    const routesRelativePath = manifest.routes || 'routes.ts';
    // Support compiling .ts to .js or loading .ts directly in development (ts-node)
    let routesAbsolutePath = path.join(featureDir, routesRelativePath);
    
    if (!fs.existsSync(routesAbsolutePath)) {
      // Fallback to .js if compiling
      const jsPath = routesAbsolutePath.replace(/\.ts$/, '.js');
      if (fs.existsSync(jsPath)) {
        routesAbsolutePath = jsPath;
      } else {
        throw new Error(`Routes file not found at: ${routesAbsolutePath}`);
      }
    }

    const routerModule = require(routesAbsolutePath);
    // Support ES exports (default or module.exports)
    const router: Router = routerModule.default || routerModule;

    if (!router || typeof router.use !== 'function') {
      throw new Error(`Invalid Express Router exported from: ${routesAbsolutePath}`);
    }

    // 4. Register the router to the express application
    this.app.use(manifest.basePath, router);

    // 5. Check if static assets are defined and serve them
    if (manifest.publicDir) {
      const publicAbsolutePath = path.join(featureDir, manifest.publicDir);
      if (fs.existsSync(publicAbsolutePath)) {
        const staticPath = manifest.basePath;
        console.log(`  └─ Serving static assets from ${publicAbsolutePath} at ${staticPath}/ui`);
        this.app.use(`${manifest.basePath}/ui`, express.static(publicAbsolutePath));
      }
    }

    // 6. Track the loaded feature
    this.loadedFeatures.set(manifest.id, {
      manifest,
      path: featureDir,
      mountedAt: new Date()
    });

    console.log(`[Fractal Kernel] Successfully mounted "${manifest.name}"!`);
  }
}
