/**
 * src/tools.js
 *
 * Each tool is a plain object:
 *   { name, description, schema, run(input: string): Promise<string> }
 *
 * The schema is a natural-language description of the expected input.
 * The ReAct agent feeds the input string directly to run().
 */

import { evaluate } from "./math.js";

// ── Calculator ─────────────────────────────────────────────────────────────────

export const calculatorTool = {
  name: "calculator",
  description:
    "Evaluates a mathematical expression and returns the numeric result. " +
    "Input: a valid math expression, e.g. '2 + 2', '(17 * 3) / 4', 'sqrt(144)'.",
  schema: "A single math expression string.",

  async run(input) {
    try {
      const result = evaluate(input.trim());
      return String(result);
    } catch (err) {
      return `Error evaluating expression: ${err.message}`;
    }
  },
};

// ── Date / time ────────────────────────────────────────────────────────────────

export const dateTool = {
  name: "get_date_time",
  description:
    "Returns the current local date and time. Input is ignored; pass any string.",
  schema: "Any string (input is ignored).",

  async run(_input) {
    return new Date().toLocaleString();
  },
};

// ── Wikipedia summary ─────────────────────────────────────────────────────────

export const wikipediaTool = {
  name: "wikipedia",
  description:
    "Fetches a short summary paragraph about a topic from Wikipedia. " +
    "Input: the topic name exactly as you would search it on Wikipedia, " +
    "e.g. 'Python (programming language)', 'Large language model'.",
  schema: "A Wikipedia article title or search query.",

  async run(input) {
    const query = encodeURIComponent(input.trim());
    const url =
      `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return `Wikipedia returned HTTP ${res.status} for query: ${input}`;
      }
      const data = await res.json();
      return data.extract ?? "No extract available.";
    } catch (err) {
      return `Network error fetching Wikipedia: ${err.message}`;
    }
  },
};

// ── Weather (stub — replace with a real API key if desired) ──────────────────

export const weatherTool = {
  name: "get_weather",
  description:
    "Returns the current weather for a city. " +
    "Input: city name, e.g. 'London', 'São Paulo'.",
  schema: "A city name string.",

  async run(input) {
    // Open-Meteo is free & requires no API key.
    // Step 1: geocode the city name.
    const city = input.trim();
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );
      const geoData = await geoRes.json();
      const loc = geoData?.results?.[0];
      if (!loc) return `Could not geocode city: ${city}`;

      const { latitude, longitude, name, country } = loc;
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=celsius`
      );
      const weatherData = await weatherRes.json();
      const cur = weatherData?.current;
      if (!cur) return "Weather data unavailable.";

      return (
        `Weather in ${name}, ${country}: ` +
        `${cur.temperature_2m}°C, wind ${cur.wind_speed_10m} km/h, ` +
        `weather code ${cur.weather_code}`
      );
    } catch (err) {
      return `Error fetching weather: ${err.message}`;
    }
  },
};

// ── Exported registry ──────────────────────────────────────────────────────────

export const ALL_TOOLS = [calculatorTool, dateTool, wikipediaTool, weatherTool];
