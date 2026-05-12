const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// use_frameworks! :linkage => :static requires $RNFirebaseAsStaticFramework = true
// so react-native-firebase knows to initialize Firebase via +load rather than the
// default ObjC category mechanism.
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
