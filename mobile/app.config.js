const base = require('./app.json').expo;

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

module.exports = {
  ...base,
  android: {
    ...base.android,
    config: {
      ...(base.android?.config || {}),
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
};
