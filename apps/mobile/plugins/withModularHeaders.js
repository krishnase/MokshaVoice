const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// RN 0.79 + Firebase: global use_modular_headers! causes 'react_runtime' redefinition
// in React-RuntimeHermes. Instead, enable modular headers only for the specific
// Firebase/Google pods that require them for Swift interop.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        return config;
      }

      const podLines = [
        'GoogleUtilities',
        'FirebaseCoreInternal',
        'nanopb',
        'GoogleDataTransport',
      ]
        .map((p) => `  pod '${p}', :modular_headers => true`)
        .join('\n');

      // Insert after use_expo_modules! inside the target block
      contents = contents.replace(
        /(\s*use_expo_modules!)/,
        `$1\n\n${podLines}`,
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
