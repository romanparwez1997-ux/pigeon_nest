const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withAdaptiveAndroid(config) {
  return withAndroidManifest(config, config => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    activity.$['android:resizeableActivity'] = 'true';
    activity.$['android:windowSoftInputMode'] = 'adjustResize';
    // Keep the React tree alive through ordinary rotations and fold/window resizing.
    const changes = new Set((activity.$['android:configChanges'] || '').split('|').filter(Boolean));
    for (const change of ['orientation', 'screenSize', 'smallestScreenSize', 'screenLayout']) changes.add(change);
    activity.$['android:configChanges'] = [...changes].join('|');
    return config;
  });
};
