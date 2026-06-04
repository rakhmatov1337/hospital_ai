function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  databaseUrl: () => req('DATABASE_URL'),
  openaiKey: () => req('OPENAI_API_KEY'),
  jwtSecret: () => process.env.JWT_SECRET ?? 'dev-secret-change-me',
  port: () => Number(process.env.PORT ?? 3000),
};
