import { z } from "zod";
import { Tool } from "../core/tool.js";

export class WeatherTool extends Tool {
  name        = "get_weather";
  description = "Returns the current weather for a city using Open-Meteo (no API key needed).";
  schema      = z.object({
    city: z.string().describe("City name, e.g. 'São Paulo', 'London', 'Tokyo'"),
  });

  async execute({ city }) {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    const geo = await geoRes.json();
    const loc = geo?.results?.[0];
    if (!loc) return `Could not geocode city: ${city}`;

    const { latitude, longitude, name, country } = loc;
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=celsius`
    );
    const w = await wRes.json();
    const c = w?.current;
    if (!c) return "Weather data unavailable.";

    return `${name}, ${country}: ${c.temperature_2m}°C, wind ${c.wind_speed_10m} km/h, code ${c.weather_code}`;
  }
}
