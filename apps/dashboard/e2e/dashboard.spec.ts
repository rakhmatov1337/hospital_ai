import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard e2e — D1 (login/auth guard) and D2 (the queue), which the spec calls
 * out as the screens staff live in and "the last to compromise".
 *
 * The API is mocked so this suite is hermetic. Assertions focus on the rules that
 * are safety-critical rather than cosmetic:
 *   - no self-registration path exists (D1)
 *   - an unauthenticated visit can never reach a staff screen
 *   - Emergency → Urgent → Routine, always in that order
 *   - an unresolved urgent item is never hidden, and a breach is flagged
 */

const SESSION_KEY = 'hospital_ai.staff.session';

/** A realistically-shaped (unsigned) JWT — the UI only ever decodes it. */
function fakeJwt(): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return [
    b64({ alg: 'RS256', typ: 'JWT' }),
    b64({
      sub: '019f0000-0000-7000-8000-000000000001',
      clinic_id: '019f0000-0000-7000-8000-0000000000c1',
      role: 'clinical_lead',
      aud: 'staff',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    'signature',
  ].join('.');
}

const QUEUE = {
  filter: 'unresolved',
  total: 3,
  lastUpdated: new Date().toISOString(),
  sections: {
    emergency: [
      {
        id: 'esc-emergency-1',
        tier: 'emergency',
        status: 'new',
        patientRef: 'DEMO-09',
        patientName: 'Emergency Patient',
        recoveryDay: 2,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        elapsedMinutes: 1,
      },
    ],
    urgent: [
      {
        id: 'esc-urgent-1',
        tier: 'urgent',
        status: 'new',
        patientRef: 'DEMO-02',
        patientName: 'Urgent Patient',
        recoveryDay: 3,
        createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
        elapsedMinutes: 45, // past the 30-minute breach threshold
      },
    ],
    routine: [
      {
        id: 'esc-routine-1',
        tier: 'routine',
        status: 'new',
        patientRef: 'DEMO-01',
        patientName: 'Routine Patient',
        recoveryDay: 6,
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        elapsedMinutes: 10,
      },
    ],
  },
};

/** Mock every API call the shell + queue make. */
async function mockApi(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/auth/staff/login')) {
      return json({ audience: 'staff', accessToken: fakeJwt() });
    }
    if (url.includes('/clinics/me')) {
      return json({ id: 'c1', name: 'Sehat Clinic (DEMO)', phone: '+998711234567', timezone: 'Asia/Tashkent' });
    }
    if (url.includes('/content/unapproved-count')) {
      return json({ unapproved: 43, total: 43 });
    }
    if (url.includes('/escalations')) {
      return json(QUEUE);
    }
    return json({});
  });
}

async function signInViaStorage(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, token]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({
          accessToken: token,
          staffId: '019f0000-0000-7000-8000-000000000001',
          clinicId: '019f0000-0000-7000-8000-0000000000c1',
          role: 'clinical_lead',
        }),
      );
    },
    [SESSION_KEY, fakeJwt()],
  );
}

test.describe('D1 · staff login', () => {
  test('renders the sign-in form and offers NO self-registration', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(
      page.getByText('Access is provisioned by your clinic. There is no self-registration.'),
    ).toBeVisible();

    // Acceptance criterion: "No self-registration path exists".
    await expect(page.getByRole('link', { name: /sign ?up|register|create account/i })).toHaveCount(0);
  });

  test('an unauthenticated visit to a staff screen is sent to login', async ({ page }) => {
    await mockApi(page);
    await page.goto('/queue');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signing in lands on the queue', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');

    await page.getByLabel('Email').fill('lead@sehat.demo');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/queue$/);
  });
});

test.describe('D2 · check-in queue', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await signInViaStorage(page);
  });

  test('shows Emergency → Urgent → Routine in that exact order', async ({ page }) => {
    await page.goto('/queue');

    const body = page.locator('body');
    await expect(body).toContainText('Emergency');
    await expect(body).toContainText('Urgent');
    await expect(body).toContainText('Routine');

    const text = (await body.innerText()).replace(/\s+/g, ' ');
    const emergency = text.indexOf('Emergency');
    const urgent = text.indexOf('Urgent');
    const routine = text.indexOf('Routine');

    expect(emergency).toBeGreaterThanOrEqual(0);
    expect(emergency).toBeLessThan(urgent);
    expect(urgent).toBeLessThan(routine);
  });

  test('never hides an unresolved urgent item, and flags the breach', async ({ page }) => {
    await page.goto('/queue');

    // The unresolved urgent patient must be on screen — no pagination, no collapse.
    await expect(page.getByText('Urgent Patient')).toBeVisible();
    // 45 minutes unacknowledged is past the 30-minute breach threshold. The UI
    // marks this twice — the row's BREACHED tag and the "Breached" status chip —
    // so match the row tag exactly rather than tripping strict mode.
    await expect(page.getByText('BREACHED', { exact: true })).toBeVisible();
    await expect(page.getByText('Breached', { exact: true })).toBeVisible();
    // The emergency item is present too and must never be pushed out of view.
    await expect(page.getByText('Emergency Patient')).toBeVisible();
  });

  test('surfaces the placeholder-content banner while content is unapproved', async ({ page }) => {
    await page.goto('/queue');
    await expect(page.getByText(/placeholder/i).first()).toBeVisible();
  });
});
