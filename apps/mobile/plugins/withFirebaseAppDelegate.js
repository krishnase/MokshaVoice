const { withAppDelegate } = require('@expo/config-plugins');

// Explicitly initialize Firebase in AppDelegate so it works with
// use_frameworks! :linkage => :static where +load ordering is unreliable.
module.exports = function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('[FIRApp configure]')) {
      return config;
    }

    // Add FirebaseCore import
    contents = contents.replace(
      /#import "AppDelegate\.h"/,
      `#import "AppDelegate.h"\n#import <FirebaseCore/FirebaseCore.h>`,
    );

    // Call [FIRApp configure] at the very start of didFinishLaunchingWithOptions
    contents = contents.replace(
      /(-\s*\(BOOL\)application:\(UIApplication\s*\*\)application\s+didFinishLaunchingWithOptions:\(NSDictionary\s*\*\)launchOptions\s*\{)/,
      `$1\n  if ([FIRApp defaultApp] == nil) { [FIRApp configure]; }`,
    );

    config.modResults.contents = contents;
    return config;
  });
};
