import {
  Client,
  CommandInteractionOptionResolver,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DISCORD_TOKEN || !process.env.OPENAI_API_KEY) {
  throw new Error(
    "Missing environment variables: DISCORD_TOKEN or OPENAI_API_KEY"
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Handle message contents
  ],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const commands = [
  new SlashCommandBuilder()
    .setName("manee")
    .setDescription("Ask Manee a question")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("The question you want to ask Manee")
        .setRequired(true)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cache = new Map<string, string>();

async function requestWithBackoff(
  question: string,
  retries: number
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Free-tier model
      messages: [{ role: "user", content: question }],
      max_tokens: 300, // Limit token usage to avoid rate limits
    });
    return response.choices[0]?.message?.content || "No response from AI.";
  } catch (error: any) {
    if (error.status === 429 && retries > 0) {
      const waitTime = Math.pow(2, 5 - retries) * 1000; // Exponential backoff
      console.log(`Rate limit hit, retrying after ${waitTime / 1000} seconds`);
      await sleep(waitTime);
      return requestWithBackoff(question, retries - 1);
    } else {
      console.error("Error:", error.message);
      throw new Error("Rate limit exceeded. Try again later.");
    }
  }
}

client.once("ready", async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    const guilds = await client.guilds.fetch(); // Fetch all guilds the bot is part of
    guilds.forEach(async (guild) => {
      const guildId = guild.id;
      console.log(`Registering commands for guild: ${guildId}`);

      await rest.put(
        Routes.applicationGuildCommands(client.user!.id, guildId),
        {
          body: commands,
        }
      );
    });

    console.log(
      "Successfully reloaded application (/) commands for all guilds."
    );
  } catch (error) {
    console.error("Error refreshing commands:", error);
  }

  console.log(`Logged in as ${client.user!.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;
  const guildId = interaction.guildId; // Retrieve guildId from interaction
  console.log(`Interaction received in guild: ${guildId}`);

  if (commandName === "manee") {
    const question = (options as CommandInteractionOptionResolver).getString(
      "question"
    );

    if (!question) {
      await interaction.reply("Please provide a question for Manee!");
      return;
    }

    if (cache.has(question)) {
      console.log(`Fetching answer from cache for: ${question}`);
      await interaction.reply(cache.get(question)!);
      return;
    }

    try {
      await interaction.deferReply(); // Defer reply while waiting for response

      // const answer = await requestWithBackoff(question, 3);
      const answer = "ควยไรสัส"; // Placeholder for OpenAI response

      cache.set(question, answer);
      await interaction.editReply(answer); // Reply with the answer
    } catch (error) {
      console.error("Error communicating with OpenAI:", error);
      await interaction.editReply(
        "Error fetching response from AI. Please try again later."
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
