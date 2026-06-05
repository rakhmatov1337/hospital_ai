import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';

/**
 * Standalone Telegram bot: greets users on /start and opens the Hospital AI
 * mini app (Telegram Web App) via a button. Runs as its own process
 * (`npm run bot`), separate from the API — grammy's large types would blow up
 * the NestJS tsc build (fatal on the 2GB server), so it's transpile-only here.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN  (from @BotFather)  — required
 *   MINI_APP_URL        (https URL of the mini app) — defaults to the patient app
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set — cannot start the bot.');
  process.exit(1);
}

const url =
  process.env.MINI_APP_URL ?? 'https://hospital-ai-doctors.vercel.app';

const openButton = () => new InlineKeyboard().webApp('🏥 Open Hospital AI', url);

const bot = new Bot(token);

bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name ?? 'there';
  await ctx.reply(
    `Hi ${name}! 👋\n\n` +
      `Welcome to *Hospital AI* — your post-surgery recovery companion.\n\n` +
      `Open the app to track your medications, daily check-ins and diet, ` +
      `and chat with your AI recovery nurse. Sign in with the access code your doctor gave you.`,
    { parse_mode: 'Markdown', reply_markup: openButton() },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Tap the button to open Hospital AI. Sign in with the access code from your doctor (e.g. HOSP-1234).',
    { reply_markup: openButton() },
  );
});

// Any other message → nudge them to open the app.
bot.on('message', async (ctx) => {
  await ctx.reply('Tap below to open Hospital AI 👇', {
    reply_markup: openButton(),
  });
});

// Persistent menu button (left of the input) that opens the mini app.
bot.api
  .setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Open App', web_app: { url } },
  })
  .catch((e) => console.warn('Could not set menu button:', String(e)));

bot.catch((err) => console.error('Bot runtime error:', err.error));

bot
  .start({
    onStart: (info) =>
      console.log(`Telegram bot @${info.username} started. Mini app: ${url}`),
  })
  .catch((e) => {
    console.error('Failed to start Telegram bot:', e);
    process.exit(1);
  });
