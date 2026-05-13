const { withAppDelegate } = require('expo/config-plugins');

// Explicitly initialize Firebase in the Swift AppDelegate so it works with
// use_frameworks! :linkage => :static where +load ordering is unreliable.
module.exports = function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('FirebaseApp.configure()')) {
      return config;
    }

    // Add FirebaseCore import after existing imports
    if (!contents.includes('import FirebaseCore')) {
      contents = contents.replace(
        /^(import Expo)/m,
        `import FirebaseCore\n$1`,
      );
    }

    // Insert FirebaseApp.configure() at the top of didFinishLaunchingWithOptions
    contents = contents.replace(
      /(didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\s*\) -> Bool \{)/,
      `$1\n    if FirebaseApp.app() == nil { FirebaseApp.configure() }`,
    );

    config.modResults.contents = contents;
    return config;
  });
};
