export const airQualityConfig = {
  locationId: process.env.OPENAQ_LOCATION_ID,
  pm25SensorId: process.env.OPENAQ_PM25_SENSOR_ID,
  aqiSensorId: process.env.OPENAQ_AQI_SENSOR_ID,
  timezone: 'Asia/Bangkok',
  forecastDays: 3,
} as const
