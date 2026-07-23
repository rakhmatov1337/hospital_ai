import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Validated environment configuration for the API.
 *
 * Only machine config lives here — never patient-visible strings. The two
 * production-gate flags (`ALLOW_PLACEHOLDER_CONTENT`, `PATIENT_ENROLMENT_ENABLED`)
 * are the safety-critical members consumed by {@link ProductionGateService}.
 *
 * `DATA_REGION` is an env var (never a hardcoded literal) per stop-condition 8.
 */
export type NodeEnv = 'development' | 'test' | 'staging' | 'production';

/** Parse a loose env string into a strict boolean ("true"/"1"/"yes" => true). */
function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return fallback;
}

export class EnvConfig {
  @IsIn(['development', 'test', 'staging', 'production'])
  @Transform(({ value }) => (value ? String(value) : 'development'))
  NODE_ENV: NodeEnv = 'development';

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  /**
   * `true` in dev/staging/demo; MUST be `false` in production. When `false`,
   * placeholder content fails closed exactly like unapproved content.
   */
  @IsBoolean()
  @Transform(({ value }) => toBool(value, false))
  ALLOW_PLACEHOLDER_CONTENT = false;

  /**
   * Default `false`. Creating a Patient while enrolment is disabled — or while
   * any required clinical content lacks a real clinician sign-off — is refused
   * with `CLINICAL_CONTENT_NOT_APPROVED`.
   */
  @IsBoolean()
  @Transform(({ value }) => toBool(value, false))
  PATIENT_ENROLMENT_ENABLED = false;

  // Infra secrets/paths owned/populated by other tasks (auth, deploy). Optional
  // here so the production gate never becomes the reason boot fails; the modules
  // that actually need them validate their own presence.
  @IsOptional()
  @IsString()
  DATA_REGION?: string;

  @IsOptional()
  @IsString()
  API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  JWT_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  JWT_PUBLIC_KEY?: string;
}

/**
 * Validate a raw env source (defaults to `process.env`) into a typed
 * {@link EnvConfig}. Throws with the aggregated class-validator messages on
 * failure. Additionally enforces the production invariant: placeholder content
 * may never be allowed in production (stop-condition, spec §5).
 */
export function loadEnvConfig(source: Record<string, unknown> = process.env): EnvConfig {
  const config = plainToInstance(EnvConfig, source, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const detail = errors
      .map((e) => Object.values(e.constraints ?? {}).join('; '))
      .filter(Boolean)
      .join(' | ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }

  if (config.NODE_ENV === 'production' && config.ALLOW_PLACEHOLDER_CONTENT) {
    throw new Error(
      'Invalid environment configuration: ALLOW_PLACEHOLDER_CONTENT must be false in production.',
    );
  }

  return config;
}
