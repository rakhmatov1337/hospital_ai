import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { env } from './env';

export function typeOrmConfig(): TypeOrmModuleOptions {
  const url = env.databaseUrl();
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(
    new URL(url).hostname,
  );
  return {
    type: 'postgres',
    url,
    autoLoadEntities: true,
    synchronize: true, // hackathon: auto-create tables, no migrations
    ssl: isLocal ? false : { rejectUnauthorized: false },
  };
}
