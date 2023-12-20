require("dotenv").config();

const { REST, Routes, MessageAttachment, ChannelType, PermissionsBitField } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");
const axios = require("axios");
const fs = require("fs");

// Validate required environment variables
const requiredEnvVars = ['OPEN_API_KEY', 'DISCORD_API_KEY', 'APPLICATION_ID', 'CHANNEL_ID', 'CHANNEL_ID2', 'CHANNEL_ID3'];
requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
        throw new Error(`Environment variable ${envVar} is missing`);
    }
});

const configuration = new Configuration({
    apiKey: process.env.OPEN_API_KEY,
});
const DISCORD_API_KEY = process.env.DISCORD_API_KEY;
const APPLICATION_ID = process.env.APPLICATION_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_ID2 = process.env.CHANNEL_ID2;
const CHANNEL_ID3 = process.env.CHANNEL_ID3;
//let blockedUsers = process.env.BLOCKED_USERS.split(",");
let channel_user = null;

const openai = new OpenAIApi(configuration);

// replace with your path to python
const PATH = '/Users/mferr/AppData/Local/Programs/Python/Python311/python.exe';

let userSessionMap = new Map();
let conversations = new Map();
let someoneUsing = false;

const commands = [
    {
        name: "complete",
        description: "Replies with: Complete your prompt.",
    },
    {
        name: "edit",
        description: "Edit an image.",
    },
    {
        name: "variation",
        description: "Create a variation of an image.",
    },
    {
        name: "chat",
        description: "Chat with your personal assistant.",
    },
    {
        name: "sd-base",
        description: "Generate a new image using Stable Diffuse (base).",
    },
    {
        name: "sd-dream",
        description: "Generate a new image using Stable Diffuse (dream).",
    }
];

const rest = new REST({ version: "10" }).setToken(DISCORD_API_KEY);

async function registerCommands() {
    try {
        console.log("Started refreshing application (/) commands.");

        await rest.put(Routes.applicationCommands(APPLICATION_ID), {
            body: commands,
        });

        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error('Failed to refresh commands: ', error.message);
    }
}

// Invoke the registerCommands function and handle any uncaught errors
registerCommands().catch(console.error);

const { Client, GatewayIntentBits } = require("discord.js");
const { channel } = require("diagnostics_channel");
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
});

// Define allowed channels for bot commands
const allowedChannels = new Set([CHANNEL_ID, CHANNEL_ID2, CHANNEL_ID3]);

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.user.bot) return;
    const guild = interaction.guild;
    const member = interaction.member;

    // Define clear function for the 'clear' command
    async function clearChannelMessages(channel) {
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            if (fetched.size === 0) {
                await interaction.followUp({ content: 'No more messages to clear.', ephemeral: true });
            } else {
                await channel.bulkDelete(fetched, true);
                await clearChannelMessages(channel);  // Recursively clear messages if more remain
            }
        } catch (error) {
            await interaction.followUp({ content: 'Cannot delete messages that are over 14 days old.', ephemeral: true });
        }
    }

    let userSession = userSessionMap.get(interaction.user.id);
    if (!userSession) {
        userSession = {
            isBase: false,
            isDream: false,
            isHelp: false,
            isEdit: false,
            isChat: false,
            isVariation: false,
        };
        userSessionMap.set(interaction.user.id, userSession);
    }

    // Handle different command interactions
    switch (interaction.commandName) {
        case "sd-base":
            if (currentUserIsUsingBot(interaction.user.id)) {
                await interaction.reply({ content: "Please wait until the bot is not in use to reduce GPU strain.", ephemeral: true });
                return;
            }
            setUserSession(interaction.user.id, { isBase: true });
            await interaction.reply("```Enter your prompt:```");
            break;

        case "sd-dream":
            if (currentUserIsUsingBot(interaction.user.id)) {
                await interaction.reply({ content: "Please wait until the bot is not in use to reduce GPU strain.", ephemeral: true });
                return;
            }
            setUserSession(interaction.user.id, { isDream: true });
            await interaction.reply("```Enter your dream prompt:```");
            break;
            
        case "complete":
            if (currentUserIsUsingBot(interaction.user.id) || userSession.isHelp) {
                await interaction.reply({ content: "```Please finish your initial command first, or wait if the bot is currently in use.", ephemeral: true });
                return;
            }

            // Before creating the OpenAI completion, validate the prompt or any necessary inputs
            setUserSession(interaction.user.id, { isHelp: true });
            await interaction.reply("```Complete your prompt:```");
            break;

        case "variation":
            if (currentUserIsUsingBot(interaction.user.id) || userSession.isVariation) {
                await interaction.reply({ content: "You're already creating a variation of an image or please wait if the bot is currently in use.", ephemeral: true });
                return;
            }

            setUserSession(interaction.user.id, { isVariation: true });
            await interaction.deferReply({ ephemeral: true });

            try {
                let num = getRandomNumber(1, 1000);
                let name = `variation-${interaction.user.tag}-${num}`
                const editChannel = await guild.channels.create({
                    name: name,
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
                let mentionString = `${interaction.user}`;
                await editChannel.send(mentionString + "``` Upload your image to create a variation.```");
            } catch (error) {
                await interaction.followUp({ content: "Failed to create a private chat for image variations.", ephemeral: true });
            }
            break;
        
        case "edit":
            if (currentUserIsUsingBot(interaction.user.id) || userSession.isEdit) {
                await interaction.reply({ content: "You're already editing an image or please wait if the bot is currently in use.", ephemeral: true });
                return;
            }

            setUserSession(interaction.user.id, { isEdit: true });
            await interaction.deferReply({ ephemeral: true });

            try {
                let num = getRandomNumber(1, 1000);
                let name = `edit-${interaction.user.tag}-${num}`
                const editChannel = await guild.channels.create({
                    name: name,
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
                let mentionString = `${interaction.user}`;
                await editChannel.send(mentionString + "``` Upload your image to create a variation.```");
            } catch (error) {
                await interaction.followUp({ content: "Failed to create a private chat for image editing.", ephemeral: true });
            }
            break;

        case "chat":
            if (currentUserIsUsingBot(interaction.user.id) || userSession.isChat) {
                await interaction.reply({ content: "You're already engaging in a chat or please wait if the bot is currently in use.", ephemeral: true });
                return;
            }

            setUserSession(interaction.user.id, { isChat: true });
            await interaction.deferReply({ ephemeral: true });

            try {
                let num = getRandomNumber(1, 1000);
                let name = `chat-${interaction.user.tag}-${num}`
                const chatChannel = await guild.channels.create({
                    name: name,
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
                await interaction.followUp({ content: "```Created a private chat channel for you.\nClick ```#" + name + "``` to chat.```", ephemeral: true });
                await chatChannel.send("```You can now chat with your personal assistant in this private channel.```");
            } catch (error) {
                await interaction.followUp({ content: "Failed to create a private chat channel.", ephemeral: true });
            }
            break;

        default:
            // Handle unknown command
            await interaction.reply({ content: 'Command not recognized.', ephemeral: true });
            break;
    }
});

client.on("messageCreate", async (msg) => {
    // Ignore bots and ensure msg is from a guild
    if (msg.author.bot || !msg.guild) return;

    // Get the user's session or ignore the message if no command has been initiated
    let userSession = userSessionMap.get(msg.author.id);
    if (!userSession) return;

    if (userSession.isBase) {
        await handleBaseImageGeneration(msg);
    } else if (userSession.isDream) {
        await handleDreamImageGeneration(msg);
    } else if (userSession.isHelp) {
        await handleHelpCommand(msg);
    } else if (userSession.isVariation) {
        await handleVariationCommand(msg);
    } else if (userSession.isChat) {
        await handleChatCommand(msg);
    } else if (userSession.isEdit) {
        await handleEditCommand(msg);
    }

});

async function handleChatCommand(msg) {
    if (currentUserIsUsingBot(msg.author.id) || !msg.channel.name.startsWith("chat-")) {
        return; // Early return if conditions are not met or the bot is in use
    }

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
        model: "gpt-4",
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
    } else {
        msg.reply("The request was either blocked or the message could not be created.");
    }

    setUserSession(msg.author.id, { isChat: false, someoneUsing: false }); // Ensuring to end the chat session
}

async function handleVariationCommand(msg) {
    if (currentUserIsUsingBot(msg.author.id) || !msg.channel.name.startsWith("edit-")) {
        return; // Early return if conditions are not met or the bot is in use
    }

    if (msg.attachments.size > 0) {
        let attachment = msg.attachments.first();
        let prompt = msg.content;

        const { spawn } = require('child_process');
        const condaPath = '/Users/mferr/AppData/Local/Microsoft/WindowsApps/python3.11.exe';
        let file = `./image-variations`;

        let condaArgs = [attachment.url, prompt];
        const python = spawn(condaPath, [file, ...condaArgs]);

        let channel = msg.channel;
        let filenames = [];
        await channel.send('```Using StableDiffusionImageVariationPipeline\nModel: ' + "sd-image-variations-diffusers" + '```');
        const discordMessage = await channel.send('```Starting...```');


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
                channel.send({
                    files: [filename]
                }).then(msg => {
                    // username string
                    let buildMentionString = `${mentionString}`;
                    msg.reply(buildMentionString);
                    fs.unlink(filename, (err) => {
                        if (err) {
                            console.error(err)
                            return
                        }
                    })
                });;
            }
            setUserSession(msg.author.id, { isVariation: false, someoneUsing: false }); // Reset states
        });
        
    } else {
        msg.reply("Please upload an image and provide a prompt.");
    }

    setUserSession(msg.author.id, { isVariation: false, someoneUsing: false }); // Ensuring to free up the bot
}

async function handleEditCommand(msg) {
    if (currentUserIsUsingBot(msg.author.id) || !msg.channel.name.startsWith("edit-")) {
        return; // Early return if conditions are not met or the bot is in use
    }
    
    if (msg.attachments.size > 0) {
        let attachment = msg.attachments.first();
        let attachment2 = msg.attachments.last();

        if(!attachment2) {
            msg.reply("Please upload 2 images and provide a prompt.");
            return;
        }
        let prompt = msg.content;

        const { spawn } = require('child_process');
        const condaPath = '/Users/mferr/AppData/Local/Microsoft/WindowsApps/python3.11.exe';
        let file = `./better-edit.py`;

        let condaArgs = [attachment.url, attachment2.url, prompt];
        const python = spawn(condaPath, [file, ...condaArgs]);

        let channel = msg.channel;
        let filenames = [];
        await channel.send('```Using StableDiffusionXLInpaintPipeline\nModel: ' + "xl-refiner-1.0" + '```');
        const discordMessage = await channel.send('```Starting...```');


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
                channel.send({
                    files: [filename]
                }).then(msg => {
                    // username string
                    let buildMentionString = `${mentionString}`;
                    msg.reply(buildMentionString);
                    fs.unlink(filename, (err) => {
                        if (err) {
                            console.error(err)
                            return
                        }
                    })
                });
            }
            setUserSession(msg.author.id, { isEdit: false, someoneUsing: false }); // Reset states
        }
        );
    } else {
        msg.reply("Please upload an image and provide a prompt.");
    }

    setUserSession(msg.author.id, { isEdit: false, someoneUsing: false }); // Ensuring to free up the bot
}

async function handleHelpCommand(msg) {
    if (currentUserIsUsingBot(msg.author.id)) {
        await msg.reply("Please wait until the bot is not in use to complete your prompt.");
        return;
    }

    msg.content = msg.content.toLowerCase();

    msg.reply("```Generating your prompt...```");
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: msg.content,
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

    } catch (error) {
        msg.reply("Error: Unable to generate a prompt from your input.");
    }

    setUserSession(msg.author.id, { isHelp: false, someoneUsing: false }); // Reset states
}

async function handleBaseImageGeneration(msg) {
    if (currentUserIsUsingBot(msg.author.id)) {
        await msg.reply("Please wait until the bot is not in use to reduce GPU strain.");
        return;
    }

    msg.content = msg.content.toLowerCase();
    // Inform the user that the process has started
    const generationMessage = await msg.reply("Generating your image... This might take some time.");

    // Call the image generation function asynchronously
    try {
        await Try_Gen(msg.content, 0, msg, generationMessage);
    } catch (error) {
        console.error("Error during image generation:", error);
        await generationMessage.edit("Error occurred while generating the image.");
    }

    // Reset the user session
    setUserSession(msg.author.id, { isBase: false, someoneUsing: false });
}

async function handleDreamImageGeneration(msg) {
    if (currentUserIsUsingBot(msg.author.id)) {
        await msg.reply("Please wait until the bot is not in use to reduce GPU strain.");
        return;
    }
    // Logic for processing the base image generation
    msg.content = msg.content.toLowerCase();
    const generationMessage = await msg.reply("Generating your image... This might take some time.");
    // Example call to an image generation function
    try {
        await Try_Gen(msg.content, 1, msg, generationMessage);
    } catch (error) {
        console.error("Error during image generation:", error);
        await generationMessage.edit("Error occurred while generating the image.");
    }
    // Update the bot usage state
    setUserSession(msg.author.id, { isDream: false, someoneUsing: false }); // Reset states
}

async function Try_Gen(prompt, delimiter, msg) {
    const { spawn } = require('child_process');

    // '/Users/michaelferraro/anaconda3/bin/conda' is the path to the 'conda' command
    const condaPath = '/Users/mferr/AppData/Local/Microsoft/WindowsApps/python3.11.exe';
    const condaArgs = prompt;

    let files = [`./stable-diffuse-v1.py`, `./dream-like-v2.py`];
    let names = ['Base', 'Dream'];

    const python = spawn(condaPath, [files[delimiter], condaArgs]);
    let channel = msg.channel;
    let user = msg.author;
    let mentionString = `${user}`;
    let filenames = [];
    await channel.send('```Using Stable Diffusion\nModel: ' + names[delimiter] + '```');
    const discordMessage = await channel.send('```Starting...```');


    python.stdout.on('data', (data) => {
        // Assuming filenames are printed line by line
        console.log(`stdout: ${data}`);
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

    python.on('close', async (code) => {
        console.log(`Python script exited with code ${code}`);
        for (let filename of filenames) {
            console.log(filename);
            await channel.send({ files: [filename] }).then (msg => {
                // username string
                let buildMentionString = `${mentionString}`;
                msg.reply(buildMentionString);
                fs.unlink(filename, (err) => {
                    if (err) {
                        console.error(err)
                        return
                    }
                })
            });
        }
        await discordMessage.edit("```Image generation completed.```");
        setUserSession(msg.author.id, { isDream: false, isBase: false, someoneUsing: false });
    });

}

// Helper functions for user session and bot usage management
function currentUserIsUsingBot(userId) {
    return someoneUsing && userSessionMap.get(userId);
}

function setUserSession(userId, sessionData) {
    const defaultSession = { isIn: true, timeout: createSessionTimeout(userId) };
    userSessionMap.set(userId, { ...defaultSession, ...sessionData });
}

function createSessionTimeout(userId) {
    return setTimeout(() => {
        userSessionMap.delete(userId);
        // Notify the user that their session has ended due to inactivity if desired
    }, 5 * 60 * 1000); // 5 minutes timeout
}

function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
client.login(DISCORD_API_KEY);
