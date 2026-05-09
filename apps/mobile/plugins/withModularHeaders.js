const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// RN 0.79 + Firebase: explicit pod declarations with :modular_headers conflict
// when react-native-firebase already declares the same pods. Instead, use a
// post_install hook to set DEFINES_MODULE = YES on the specific pod targets.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      const marker = '# BEGIN withModularHeaders';
      if (contents.includes(marker)) {
        return config;
      }

      const postInstallSnippet = `
  ${marker}
  installer.pods_project.targets.each do |target|
    modular_pods = %w[GoogleUtilities FirebaseCoreInternal nanopb GoogleDataTransport]
    if modular_pods.include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['DEFINES_MODULE'] = 'YES'
      end
    end
  end`;

      // Insert at the start of the existing post_install block
      contents = contents.replace(
        /^(\s*post_install do \|installer\|)/m,
        `$1${postInstallSnippet}`,
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
