const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Suppresses Swift 6 strict-concurrency errors in expo-modules-core when
// built with use_frameworks! :linkage => :static (required for Firebase).
module.exports = function withSwiftConcurrency(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes('SWIFT_STRICT_CONCURRENCY')) {
        return config; // already injected
      }

      const injection = [
        '    # ── Swift 6 strict-concurrency suppression ─────────────────────',
        '    installer.pods_project.targets.each do |target|',
        '      target.build_configurations.each do |cfg|',
        "        cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'",
        "        cfg.build_settings['OTHER_SWIFT_FLAGS'] ||= '$(inherited)'",
        "        if !cfg.build_settings['OTHER_SWIFT_FLAGS'].include?('-strict-concurrency')",
        "          cfg.build_settings['OTHER_SWIFT_FLAGS'] += ' -strict-concurrency=minimal'",
        '        end',
        '      end',
        '    end',
      ].join('\n');

      // Match `post_install do |installer|` regardless of leading whitespace
      contents = contents.replace(
        /(post_install do \|installer\|)/,
        `$1\n${injection}`,
      );

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
