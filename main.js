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
//const SERVER_ID = process.env.SERVER_ID;
//optional, can change to list/map if you want to support multiple channels
const CHANNEL_ID = process.env.CHANNEL_ID;
//let blockedUsers = process.env.BLOCKED_USERS.split(",");

const openai = new OpenAIApi(configuration);

let userSessionMap = new Map();
let conversations = new Map();
let someoneUsing = false;

const commands = [
    {
        name: "complete",
        description: "Replies with: Complete your prompt.",
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
    {
        name: "new-image",
        description: "Generate a new image.",
    }
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


client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    //const guild = client.guilds.cache.get(SERVER_ID);
    //if (!guild) return console.error('Guild not found!');
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.user.bot) return;
    //if (interaction.user.id in blockedUsers) return;

    if (interaction.commandName === "close") {
        const channel = client.channels.cache.get(
            interaction.channelId.toString()
        );
        if (channel == CHANNEL_ID) {
            interaction.reply("```You can't close this channel.```");
            return;
        }
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

    if (interaction.channelId !== CHANNEL_ID) {
        interaction.reply(`I CANT WORK IN HERE USE <#${CHANNEL_ID}> INSTEAD!!!!!`);
        return;
    }

    let userSession = userSessionMap.get(interaction.user.id);

    if (interaction.isChatInputCommand()) {
        userSession = {
            isIn: true,
            isHelp: false,
            isEdit: false,
            isChat: false,
            isNew: false,
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
            //userSession.isImage ||
            userSession.isEdit ||
            userSession.isChat || userSession.isNew)
    ) {
        interaction.reply("```Finish your intitial command.```");
        return;
    }

    if (interaction.commandName === "new-image") {
        userSession.isNew = true;
        if (someoneUsing){interaction.reply("```Please wait until not in use to reduce GPU strain.```"); return;}
        userSessionMap.set(interaction.user.id, userSession);

        await interaction.reply("```Enter your prompt.```");
        someoneUsing = true;
    }

    if (interaction.commandName === "complete") {
        userSession.isHelp = true;
        userSessionMap.set(interaction.user.id, userSession);

        await interaction.reply("```Complete your prompt?```");
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
            name: `chat-${interaction.user.tag} #` + Math.floor(Math.random() * 1000),
            type: ChannelType.GuildText,
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

    if (userSession.isNew) {
        msg.content = msg.content.toLowerCase();
        msg.reply("```Generating your image... This might take some time.```");
        Try_Gen(msg.content);
        userSession.isNew = false;
    }

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
                1, "512x512"
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

async function Try_Gen(prompt) {
    const { spawn } = require('child_process');

    // '/Users/michaelferraro/anaconda3/bin/conda' is the path to the 'conda' command
    const condaPath = '/Users/mferr/AppData/Local/Programs/Python/Python311/python.exe';
    const condaArgs = prompt;

    const python = spawn(condaPath, [`./stable-diffuse-v1.py`, condaArgs]);

    let filenames = [];
    let discordMessage = await client.channels.cache.get(CHANNEL_ID).send('```Starting...```');

    python.stdout.on('data', (data) => {
        // Assuming filenames are printed line by line
        filenames.push(data.toString().trim());
    });

    //print error
    let messageQueue = [];
    let isSending = false;

    python.stderr.on('data', async (data) => {
        console.error(`stderr: ${data}`);
        messageQueue.push(data);

        if (!isSending) {
            isSending = true;
            setInterval(sendMessage, 1000);
        }
    });

    function sendMessage() {
        if (messageQueue.length > 0) {
            let message = messageQueue.pop();
            discordMessage.edit("```" + message + "```");
            messageQueue = [];
        } else {
            isSending = false;  // If no messages left to send, stop the interval.
            clearInterval(this);
        }
    }

    python.on('close', (code) => {
        console.log(`Python script exited with code ${code}`);
        // Send the images once the Python script has finished executing
        for (let filename of filenames) {
            //send to channel with CHANNEL_ID
            client.channels.cache.get(CHANNEL_ID).send({
                files: [filename]
            });
        }
        someoneUsing = false;
    });

}
client.login(DISCORD_API_KEY);