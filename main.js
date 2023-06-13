require("dotenv").config();

const { REST, Routes } = require("discord.js");
const MessageAttachment = require("discord.js");
const ChannelType = require("discord.js");
const { PermissionsBitField } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");
const axios = require("axios");
const fs = require("fs");

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});
const DISCORD_API_KEY = process.env.DISCORD_API_KEY;
const APPLICATION_ID = process.env.APPLICATION_ID;
const openai = new OpenAIApi(configuration);

let userSessionMap = new Map();
let conversations = new Map();

const commands = [
	{
		name: "complete",
		description: "Replies with: Complete your prompt.",
	},
	{
		name: "imagine",
		description: "Replies with: Describe your image.",
	},
	{
		name: "clear",
		description: "Clears messages.",
	},
	{
		name: "edit",
		description: "Edit an image.",
	},
	{
		name: "close",
		description: "Close the private chat.",
	},
	{
		name: "chat",
		description: "Chat with your personal assistant.",
	},
	{
		name: "create-channel",
		description: "Create a channel.",
	},
	// {
	// 	name: "audio",
	// 	description: "Transcribes or translates audio.",
	// },
];

const rest = new REST({ version: "10" }).setToken(DISCORD_API_KEY);

(async () => {
	try {
		console.log("Started refreshing application (/) commands.");

		await rest.put(Routes.applicationCommands(APPLICATION_ID), {
			body: commands,
		});

		console.log("Successfully reloaded application (/) commands.");
	} catch (error) {
		console.error(error);
	}
})();

const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
});

client.on("ready", () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.user.bot) return;
	let userSession = userSessionMap.get(interaction.user.id);

	if (interaction.isChatInputCommand()) {
		userSession = {
			isIn: true,
			isHelp: false,
			isImage: false,
			isEdit: false,
			isChat: false,
			current_user_id: interaction.user.tag,
			timeout: setTimeout(() => {
				userSessionMap.delete(interaction.user.id);
			}, 5 * 60 * 1000), // 5 minutes timeout
		};
		userSessionMap.set(interaction.user.id, userSession);
	}

	if (
		userSession &&
		userSession.isIn &&
		(userSession.isHelp ||
			userSession.isImage ||
			userSession.isEdit ||
			userSession.isChat)
	) {
		interaction.reply("```Finish your intitial command.```");
		return;
	}

	if (interaction.commandName === "close") {
		const channel = client.channels.cache.get(
			interaction.channelId.toString()
		);
		channel.delete();
	}

	if (interaction.commandName === "clear") {
		const channel = client.channels.cache.get(
			interaction.channelId.toString()
		);

		async function clear() {
			try {
				const fetched = await channel.messages.fetch({ limit: 100 });
				if (fetched.size === 0) {
					return interaction.followUp({
						content: "```No more messages to clear.```",
						ephemeral: true,
					});
				} else {
					await channel.bulkDelete(fetched, true);
					clear();
				}
			} catch (error) {
				return interaction.followUp({
					content:
						"```Can't delete messages that are over 14 days old.```",
					ephemeral: true,
				});
			}
		}

		// Respond to the interaction immediately
		await interaction.reply({
			content: "```Starting to clear chat history...```",
			ephemeral: true,
		});

		// Then clear messages asynchronously
		clear();
	}

	if (interaction.commandName === "complete") {
		userSession.isHelp = true;
		userSessionMap.set(interaction.user.id, userSession);

		userSessionMap.set(interaction.user.id, userSession);

		await interaction.reply("```Complete your prompt?```");
		current_id_loop = interaction.user.id;
		isHelp = true;
		current_user_id = interaction.user.tag;
		isIn = true;
	}

	if (interaction.commandName === "imagine") {
		userSession.isImage = true;
		userSessionMap.set(interaction.user.id, userSession);

		await interaction.reply(
			"```Describe your image. Format should be: [Prompt] [Type of image(4k, pencil, etc)]```"
		);
	}

	if (interaction.commandName === "edit") {
		userSession.isEdit = true;
		userSessionMap.set(interaction.user.id, userSession);

		await interaction.reply(
			"```Creating a private chat to upload your image.```"
		);

		const guild = interaction.guild;
		const member = interaction.member;

		const channel = await guild.channels.create({
			name: `edit-${interaction.user.tag}`,
			type: ChannelType.GuildText,
			//parent: "899999999999999999",
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [PermissionsBitField.Flags.SendMessages],
				},
				{
					id: member.id,
					allow: [PermissionsBitField.Flags.SendMessages],
				},
			],
		});

		// Send a message to the newly created channel
		channel.send(
			`Hello, <@${interaction.user.id}>! The format for editing an image is as follows: First select the image you want to edit, then, select a map image. A map image is an image that has transparent sections, these sections are where you want to add things to, lastly type in a prompt and send the message!`
		);
	}

	if (interaction.commandName === "chat") {
		userSession.isChat = true;
		userSessionMap.set(interaction.user.id, userSession);

		await interaction.reply(
			"```Chat with your personal assistant. A new channel is being created for you.```"
		);
		const guild = interaction.guild;
		const member = interaction.member;

		const channel = await guild.channels.create({
			name: `chat-${interaction.user.tag}`,
			type: ChannelType.GuildText,
			//parent: "899999999999999999",
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [PermissionsBitField.Flags.SendMessages],
				},
				{
					id: member.id,
					allow: [PermissionsBitField.Flags.SendMessages],
				},
			],
		});

		// Send a message to the newly created channel
		channel.send(
			`Hello, <@${interaction.user.id}>! You can now chat with your personal assistant.`
		);
	}
});

client.on("messageCreate", async (msg) => {
	let userSession = userSessionMap.get(msg.author.id);
	if (!userSession) return; // The user is not in the middle of a command

	clearTimeout(userSession.timeout); // clear the old timeout
	userSession.timeout = setTimeout(() => {
		// set a new timeout
		userSessionMap.delete(msg.author.id);
	}, 5 * 60 * 1000); // 5 minutes timeout

	if (userSession.isHelp) {
		msg.content = msg.content.toLowerCase();

		msg.reply("```Generating your prompt...```");

		const response = await openai.createCompletion({
			model: "text-davinci-003",
			prompt: msg.content.toString(),
			max_tokens: 1024,
			temperature: 0.7,
			n: 1,
		});

		if (
			response &&
			response.data &&
			response.data.choices &&
			Array.isArray(response.data.choices) &&
			response.data.choices.length > 0
		) {
			// check if it is over 2000 characters, discord limits
			if (response.data.choices[0].text.length > 1500) {
				//if over split into messages until no text remains
				let text = response.data.choices[0].text;
				let textArray = text.match(/[\s\S]{1,1500}/g);
				textArray.forEach((element) => {
					msg.reply("```" + element.trim() + "```");
				});
			}
			msg.reply("```" + response.data.choices[0].text.trim() + "```");
		} else {
			msg.reply("```Error: No response from AI.```");
		}
		// Done
		userSession.isHelp = false;
		userSession.isIn = false;
	} else if (userSession.isImage) {
		msg.content = msg.content.toLowerCase();

		msg.reply("```Creating your image...```");

		try {
			const response = await openai.createImage({
				prompt: msg.content.toString(),
				n: 1,
				size: "1024x1024",
			});
			let links = response.data.data.map((element) => {
				return element.url;
			});
			if (links.length > 0) {
				links.forEach((element) => {
					msg.reply(element);
				});
			} else {
				msg.reply(
					"The request was either blocked or the image could not be created."
				);
			}

			userSession.isImage = false;
			userSession.isIn = false;
		} catch (error) {
			msg.reply("```" + error + "```");
			return;
		}
	} else if (userSession.isEdit) {
		if (msg.author.bot || !msg.channel.name.startsWith("edit-")) return;

		if (msg.attachments.size > 0) {
			let attachment = msg.attachments.first();
			let mask = msg.attachments.last();
			let prompt = msg.content; // This is your prompt

			// Download the attachment
			let response = await axios.get(attachment.url, {
				responseType: "arraybuffer",
			});
			let buffer = response.data;

			let response1 = await axios.get(mask.url, {
				responseType: "arraybuffer",
			});
			let buffer1 = response1.data;

			// Save it temporarily
			fs.writeFile("./tempfile1.png", buffer, () =>
				msg.reply("finished downloading image 1...")
			);

			fs.writeFile("./tempfile2.png", buffer1, () =>
				msg.reply("finished downloading image 2...")
			);

			const aiResponse = await openai.createImageEdit(
				fs.createReadStream("./tempfile1.png"),
				prompt,
				fs.createReadStream("./tempfile2.png"),
				1
			);

			msg.reply("Awaiting response from AI...");

			let links = aiResponse.data.data.map((element) => {
				return element.url;
			});
			if (links.length > 0) {
				links.forEach((element) => {
					msg.reply(element);
				});
			} else {
				msg.reply(
					"The request was either blocked or the image could not be created."
				);
			}
			userSession.isEdit = false;
			userSession.isIn = false;
			userSessionMap.delete(msg.author.id);
		}
	} else if (userSession.isChat) {
		if (msg.author.bot || !msg.channel.name.startsWith("chat-")) return;
		{
			let userId = msg.author.id;
			let content = msg.content;

			const configuration = new Configuration({
				apiKey: process.env.OPENAI_API_KEY,
			});
			const openai = new OpenAIApi(configuration);

			if (content.toLowerCase() === "exit") {
				conversations.delete(userId);
				msg.reply(
					"The conversation has ended. Feel free to restart the conversation anytime!"
				);
				return;
			}

			if (!conversations.has(userId)) {
				conversations.set(userId, [
					{
						role: "assistant",
						content: "You are a helpful assistant.",
					},
				]);
			}

			conversations.get(userId).push({ role: "user", content: content });

			const response = await openai.createChatCompletion({
				model: "gpt-3.5-turbo-16k",
				messages: conversations.get(userId),
                temperature: 0.7,
                presence_penalty: 1,
			});

			if (
				response &&
				response.data &&
				response.data.choices &&
				response.data.choices.length > 0
			) {
				let botResponse = response.data.choices[0].message.content;

				// Append the bot's response to the history
				conversations
					.get(userId)
					.push({ role: "assistant", content: botResponse });

				// Respond to the user
                // check if the response is over 1750 characters, discord limits
                if (botResponse.length > 1750) {
                    //if over split into messages until no text remains
                    let text = botResponse;
                    let textArray = text.match(/[\s\S]{1,1750}/g);
                    textArray.forEach((element) => {
                        msg.reply("```" + element.trim() + "```");
                    });
                }
                else {
				    msg.reply(botResponse);
                }
			}
		}
	}
});
client.login(DISCORD_API_KEY);
