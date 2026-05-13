const { withAppDelegate } = require('expo/config-plugins');

// Firebase Phone Auth needs APNs tokens to verify phone numbers via silent push.
// With use_frameworks! :linkage => :static, Firebase's AppDelegate swizzling that
// captures the APNs token doesn't work. We fix this by:
//   1. Explicitly calling FirebaseApp.configure() + registerForRemoteNotifications()
//   2. Forwarding didRegisterForRemoteNotificationsWithDeviceToken to Firebase Auth
//   3. Forwarding didReceiveRemoteNotification to Firebase Auth
module.exports = function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    // Add FirebaseCore import if missing
    if (!contents.includes('import FirebaseCore')) {
      contents = contents.replace(
        /^(import Expo)/m,
        `import FirebaseCore\n$1`,
      );
    }

    // Add FirebaseAuth import if missing
    if (!contents.includes('import FirebaseAuth')) {
      contents = contents.replace(
        /^(import Expo)/m,
        `import FirebaseAuth\n$1`,
      );
    }

    // Add configure + registerForRemoteNotifications at app launch if missing
    if (!contents.includes('FirebaseApp.configure()')) {
      contents = contents.replace(
        /(didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\s*\) -> Bool \{)/,
        `$1\n    if FirebaseApp.app() == nil { FirebaseApp.configure() }\n    application.registerForRemoteNotifications()`,
      );
    } else if (!contents.includes('registerForRemoteNotifications()')) {
      // configure already there but registerForRemoteNotifications is missing
      contents = contents.replace(
        /if FirebaseApp\.app\(\) == nil \{ FirebaseApp\.configure\(\) \}/,
        `if FirebaseApp.app() == nil { FirebaseApp.configure() }\n    application.registerForRemoteNotifications()`,
      );
    }

    // Add APNs forwarding methods if missing
    if (!contents.includes('setAPNSToken')) {
      const apnsMethods = `
  // Forward APNs token to Firebase Auth (required for phone number verification)
  public override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Auth.auth().setAPNSToken(deviceToken, type: .unknown)
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  // Forward silent notifications to Firebase Auth (used during phone verification)
  public override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    if Auth.auth().canHandleNotification(userInfo) {
      completionHandler(.noData)
      return
    }
    super.application(application, didReceiveRemoteNotification: userInfo, fetchCompletionHandler: completionHandler)
  }

`;
      contents = contents.replace(/(\s*\/\/ Linking API)/, `${apnsMethods}$1`);
    }

    config.modResults.contents = contents;
    return config;
  });
};
