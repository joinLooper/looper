const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// Exclude local evidence and toolchains, without changing Expo's workspace resolution.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  ).filter(Boolean),
  /[/\\](output|\.runtime|\.pnpm-store)[/\\]/,
];
module.exports = config;
