const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// RN 0.79 + Firebase: Swift pods (FirebaseAuth, FirebaseCoreInternal) require
// modular headers on their Obj-C dependencies for Swift interop. We cannot use
// global use_modular_headers! (causes react_runtime redefinition in RN 0.79).
// Instead, declare the exact pods that need modular headers explicitly.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        return config;
      }

      // Complete set required by FirebaseAuth and FirebaseCoreInternal Swift pods
      const podLines = [
        'GoogleUtilities',
        'FirebaseCoreInternal',
        'FirebaseAuthInterop',
        'FirebaseAppCheckInterop',
        'RecaptchaInterop',
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
