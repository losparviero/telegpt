import dotenv from "dotenv";
dotenv.config();
import { Bot, webhookCallback, GrammyError, HttpError } from "grammy";
import { ChatGPTAPI } from "chatgpt";

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

// Auth

const api = new ChatGPTAPI({
  apiKey: process.env.API_KEY,
});

// Admin

const BOT_DEVELOPER = 0 | process.env.BOT_DEVELOPER;
bot.use(async (ctx, next) => {
  ctx.config = {
    botDeveloper: BOT_DEVELOPER,
    isDeveloper: ctx.chat?.id === BOT_DEVELOPER,
  };
  await next();
});

// Commands

bot.command("start", async (ctx) => {
  if (!ctx.chat.type == "private") {
    await bot.api.sendMessage(
      ctx.chat.id,
      "*Channels and groups are not supported presently.*",
      { parse_mode: "Markdown" }
    );
    return;
  }
  await ctx
    .reply(
      "*Welcome!* ✨\n_This is a private ChatGPT instance for @anzubo.\nIf you want to request access please get in touch!_",
      {
        parse_mode: "Markdown",
      }
    )
    .then(console.log("New user added:\n", ctx.from));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This is a utility bot using OpenAI's API (paid).\nUnauthorized use is not permitted.\nIn the future I may allow users to set their own API keys._",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.chat.id));
});

// Messages

bot.on("message", async (ctx) => {
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.message.text}`
  );

  // Logic
  if (!ctx.config.isDeveloper) {
    await ctx.reply("*You don't have authorization to use this bot.*", {
      reply_to_message_id: ctx.message.message_id,
      parse_mode: "Markdown",
    });
  } else {
    try {
      const statusMessage = await ctx.reply(`*Processing*`, {
        parse_mode: "Markdown",
      });
      async function deleteMessageWithDelay(fromId, messageId, delayMs) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            bot.api
              .deleteMessage(fromId, messageId)
              .then(() => resolve())
              .catch((error) => reject(error));
          }, delayMs);
        });
      }
      await deleteMessageWithDelay(ctx.chat.id, statusMessage.message_id, 3000);
      await Promise.race([
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Function execution timed out.")),
            7000
          )
        ),
        new Promise(async (resolve) => {
          const res = await api.sendMessage(ctx.msg.text);
          console.log(res.detail.usage);
          await ctx
            .reply(
              `${res.text}\n\n*${res.detail.usage.total_tokens} tokens used in this query*`,
              {
                reply_to_message_id: ctx.message.message_id,
                parse_mode: "Markdown",
              }
            )
            .then(() =>
              console.log(`Function executed successfully from ${ctx.chat.id}`)
            );
          resolve();
        }),
      ]);
    } catch (error) {
      if (error instanceof GrammyError) {
        if (error.message.includes("Forbidden: bot was blocked by the user")) {
          console.log("Bot was blocked by the user");
        } else if (error.message.includes("Call to 'sendMessage' failed!")) {
          console.log("Error sending message: ", error);
          await ctx.reply(`*Error contacting Telegram.*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.message.message_id,
          });
        } else {
          await ctx.reply(`*An error occurred: ${error.message}*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.message.message_id,
          });
        }
        console.log(`Error sending message: ${error.message}`);
        return;
      } else {
        console.log(`An error occured:`, error);
        await ctx.reply(`*An error occurred.*\n_Error: ${error.message}_`, {
          parse_mode: "Markdown",
          reply_to_message_id: ctx.message.message_id,
        });
        return;
      }
    }
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

bot.start();
