module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo already wires up react-native-worklets/plugin when the
    // package is installed. Adding it again here transforms worklets twice and
    // silently stops every Reanimated animation from running.
    presets: ['babel-preset-expo'],
  };
};
