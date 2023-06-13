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

let isHelp = false;
let isIn = false;
let isImage = false;
let isEdit = false;
let current_user_id = null;
let current_id_loop = null;
let memory = new Map();

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
    }
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
    if (interaction.commandName === "close") {
		const channel = client.channels.cache.get(
			interaction.channelId.toString()
		);
		channel.delete();
	}
	if (!interaction.isChatInputCommand()) return;
	if (isIn) {
		interaction.reply(
			"```I am already helping " + current_user_id + ".```"
		);
		return;
	}
	console.log(interaction);

	if (interaction.commandName === "clear") {
		const channel = client.channels.cache.get(
			interaction.channelId.toString()
		);
		// check if user has permission to clear messages
		// if (!interaction.member.id != "399962653881139220") {
		// 	interaction.reply(
		// 		"```You do not have permission to clear messages.```"
		// 	);
		// 	return;
		// }

		channel
			.bulkDelete(10)
			.then(() =>
				interaction.channel.send("```Chat history cleared.```")
			);
	}

	if (interaction.commandName === "complete") {
		const channel = client.channels.cache.get(
			interaction.channelId.toString()
		);

		await interaction.reply("```Complete your prompt?```");
		current_id_loop = interaction.user.id;
		isHelp = true;
        current_user_id = interaction.user.tag;
		isIn = true;
	}

	if (interaction.commandName === "imagine") {
		const channel = client.channels.cache.get(
			interaction.channelId.toString()
		);

		await interaction.reply("```Describe your image.```");
		current_id_loop = interaction.user.id;
		isImage = true;
        current_user_id = interaction.user.tag;
		isIn = true;
	}

    if(interaction.commandName === "edit"){
        await interaction.reply("```Creating a private chat to upload your image.```");
        //console.log(`User ID: ${interaction.user.tag}`);

        current_id_loop = interaction.user.id;
        isEdit = true;
        current_user_id = interaction.user.tag;
        isIn = true;
        const guild = interaction.guild;
		const member = interaction.member;

		const channel = await guild.channels.create({
			name: `private-${interaction.user.tag}`,
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
			`Hello, @${interaction.user.tag}! Please upload an image file.`
		);
    }

    
});

client.on("messageCreate", async (msg) => {
	if (isHelp && msg.author.id == current_id_loop) {
		msg.content = msg.content.toLowerCase();

        const response = await openai.createCompletion({
			model: "text-davinci-003",
			prompt: msg.content.toString(),
			max_tokens: 1024,
			temperature: 0.7,
			n: 1,
		});
		// console.log(response);
		// Check if the expected property is in the response before using it.
		if (
			response &&
			response.data &&
			response.data.choices &&
			Array.isArray(response.data.choices) &&
			response.data.choices.length > 0
		) {
            // check if it is over 2000 characters
            if(response.data.choices[0].text.length > 1500){
                //if over split into 2 messages
                msg.reply("```" + response.data.choices[0].text.substring(0, 1500) + "```");
                msg.reply("```" + response.data.choices[0].text.substring(1500, response.data.choices[0].text.length) + "```");
            }
			msg.reply("```" + response.data.choices[0].text.trim() + "```");
		} else {
			console.log("Choices is not available");
		}

		isHelp = false;
		isIn = false;
	} else if (isImage && msg.author.id == current_id_loop) {
		msg.content = msg.content.toLowerCase();

        try{
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

            isImage = false;
            isIn = false;

        }
        catch (error){
            msg.reply("```" + error + "```");
            return;
        }
        
	} else if (isEdit && msg.author.id == current_id_loop) {
        if (msg.author.bot || !msg.channel.name.startsWith("private-")) return;
        if (msg.attachments.size > 0) {
            // console.log("msg:\n");
            // console.log(msg);
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
				console.log("finished downloading!")
			);

            fs.writeFile("./tempfile2.png", buffer1, () =>
				console.log("finished downloading!")
			);

			// Now you have the image saved locally and can send it to the OpenAI API
			// along with your prompt.
            console.log("\n\n\n\n\n\n\n\n\n\n\n\n\n\n");
            console.log(prompt);
            console.log("\n\n\n\n\n\n\n\n\n\n\n\n\n\n");
			const aiResponse = await openai.createImageEdit(
				fs.createReadStream("./tempfile1.png"),
				prompt,
				fs.createReadStream("./tempfile2.png"),1
			);
            console.log(aiResponse);
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
			isEdit = false;
			isIn = false;
		}
    }
});
client.login(DISCORD_API_KEY);