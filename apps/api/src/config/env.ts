const numberFromEnv = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  apiHost: process.env.API_HOST ?? "0.0.0.0",
  apiPort: numberFromEnv(process.env.API_PORT, 8456),
  corsOrigin:
    process.env.CORS_ORIGIN ??
    `http://localhost:${numberFromEnv(process.env.WEB_PORT ?? process.env.PORT, 8455)}`,
  nodeEnv: process.env.NODE_ENV ?? "development"
};
