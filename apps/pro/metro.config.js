// Metro configuration for a monorepo workspace.
// Docs: https://docs.expo.dev/guides/monorepos/
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so edits in packages/* trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Note: hierarchical lookup is deliberately left enabled. Disabling it (older
// monorepo guidance) hides packages' own nested node_modules from Metro, which
// breaks dependencies npm could not hoist.

module.exports = withNativeWind(config, { input: './src/global.css' });
