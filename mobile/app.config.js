const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: googleMapsApiKey },
    },
  },
});
