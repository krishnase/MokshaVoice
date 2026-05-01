const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Adds `use_modular_headers!` globally so Firebase's Swift pods (FirebaseCoreInternal,
// GoogleUtilities) can be imported without `use_frameworks!`.
// `use_frameworks! :linkage => :static` broke expo-modules-core's isolated @MainActor
// conformances; this targeted fix satisfies Firebase without affecting Swift compilation.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('use_modular_headers!')) {
        return config;
      }

      // Insert right before the target block so it applies globally to all pods
      contents = contents.replace(
        /^(target ['"]MokshaVoice['"] do)/m,
        `use_modular_headers!\n\n$1`,
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
