const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// react-native-firebase v24 + Firebase SDK 12 without use_frameworks!:
// Certain Firebase pods need explicit :modular_headers => true so Xcode can
// find their generated ObjC-Swift bridging headers (e.g. FirebaseAuth-Swift.h).
// $RNFirebaseAsStaticFramework tells RNFBApp to build as a static framework.
const MODULAR_PODS = [
  'GoogleUtilities',
  'FirebaseCoreInternal',
  'FirebaseAuthInterop',
  'FirebaseAppCheckInterop',
  'RecaptchaInterop',
  'nanopb',
  'GoogleDataTransport',
];

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('$RNFirebaseAsStaticFramework')) {
        return config;
      }

      const podDeclarations = MODULAR_PODS.map(
        (pod) => `  pod '${pod}', :modular_headers => true`,
      ).join('\n');

      contents = contents.replace(
        /^(target ['"]MokshaVoice['"] do)/m,
        `$RNFirebaseAsStaticFramework = true\n\n$1\n${podDeclarations}`,
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
