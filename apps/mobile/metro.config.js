const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Let Metro see the whole monorepo so workspace packages resolve
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Block backend (Node.js) code from being bundled into the mobile app
const backendPath = path.resolve(workspaceRoot, 'apps/backend');
config.resolver.blockList = [
  new RegExp(`^${backendPath.replace(/[/\\]/g, '[/\\\\]')}\\/.*$`),
];

// Fix Firebase ESM/CJS resolution conflict with Metro + Hermes
config.resolver.sourceExts = ['jsx', 'js', 'ts', 'tsx', 'cjs', 'json'];
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
