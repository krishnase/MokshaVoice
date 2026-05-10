const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// react-native-firebase v24 + Firebase SDK 12 with use_frameworks! :linkage => :static:
// Set $RNFirebaseAsStaticFramework = true so RNFBApp builds as a static framework and
// can find FirebaseAuth-Swift.h and other generated Swift headers correctly.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('$RNFirebaseAsStaticFramework')) {
        return config;
      }

      contents = contents.replace(
        /^(target ['"]MokshaVoice['"] do)/m,
        `$RNFirebaseAsStaticFramework = true\n\n$1`,
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
