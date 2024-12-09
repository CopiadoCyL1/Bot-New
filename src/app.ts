import "dotenv/config";
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { MemoryDB } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { toAsk, httpInject } from "@builderbot-plugins/openai-assistants";
import { typing } from "./utils/presence";

/** Puerto en el que se ejecutará el servidor */
const PORT = process.env.PORT ?? 3008;
/** ID del asistente de OpenAI */
const ASSISTANT_ID = process.env.ASSISTANT_ID ?? '';
const userQueues = new Map();
const userLocks = new Map(); // New lock mechanism
const respondedMessages = new Set(); // Set to track already responded messages
const manuallyRespondedMessages = new Set(); // Set to track manually responded messages

/**
 * Function to process the user's message by sending it to the OpenAI API
 * and sending the response back to the user.
 */
const processUserMessage = async (ctx, { flowDynamic, state, provider }) => {
    const userId = ctx.from;

    // Check if the message was already responded to, if so, do nothing
    if (respondedMessages.has(userId + ctx.body)) {
        console.log(`Message already responded to: ${ctx.body}`);
        return;
    }

    // Check if the message was manually responded to, if so, do nothing
    if (manuallyRespondedMessages.has(userId + ctx.body)) {
        console.log(`Message manually responded to: ${ctx.body}`);
        return;
    }

    // Delay the response by 100 seconds (100,000 milliseconds)
    await new Promise(resolve => setTimeout(resolve, 20000));  // 100 seconds delay

    // Mark this message as responded
    respondedMessages.add(userId + ctx.body);

    await typing(ctx, provider);
    const response = await toAsk(ASSISTANT_ID, ctx.body, state);

    // Add a note to the response indicating that it's from a bot
    const botNotice = "\n\n*Este es un mensaje automatizado del Bot DisArt.Y.S.*";

    // Split the response into chunks and send them sequentially
    const chunks = response.split(/\n\n+/);
    for (const chunk of chunks) {
        const cleanedChunk = chunk.trim().replace(/【.*?】\s?/g, "").replace(/\[\d+:\d+\]/g, "") + botNotice;
        await flowDynamic([{ body: cleanedChunk }]);
    }
}

/**
 * Function to handle the queue for each user.
 */
const handleQueue = async (userId) => {
    const queue = userQueues.get(userId);
    
    if (userLocks.get(userId)) {
        return; // If locked, skip processing
    }

    while (queue.length > 0) {
        userLocks.set(userId, true); // Lock the queue
        const { ctx, flowDynamic, state, provider } = queue.shift();
        try {
            // Check if the message has been responded to manually
            if (!manuallyRespondedMessages.has(userId + ctx.body)) {
                await processUserMessage(ctx, { flowDynamic, state, provider });
            } else {
                console.log(`Message manually responded to: ${ctx.body}`);
            }
        } catch (error) {
            console.error(`Error processing message for user ${userId}:`, error);
        } finally {
            userLocks.set(userId, false); // Release the lock
        }
    }

    userLocks.delete(userId); // Remove the lock once all messages are processed
    userQueues.delete(userId); // Remove the queue once all messages are processed
};

/**
 * Flujo de bienvenida que maneja las respuestas del asistente de IA
 * @type {import('@builderbot/bot').Flow<BaileysProvider, MemoryDB>}
 */
const welcomeFlow = addKeyword<BaileysProvider, MemoryDB>(EVENTS.WELCOME)
    .addAction(async (ctx, { flowDynamic, state, provider }) => {
        const userId = ctx.from; // Use the user's ID to create a unique queue for each user

        if (!userQueues.has(userId)) {
            userQueues.set(userId, []);
        }

        const queue = userQueues.get(userId);
        queue.push({ ctx, flowDynamic, state, provider });

        // If this is the only message in the queue, process it immediately
        if (!userLocks.get(userId) && queue.length === 1) {
            await handleQueue(userId);
        }
    });

/**
 * Función principal que configura y inicia el bot
 * @async
 * @returns {Promise<void>}
 */
const main = async () => {
    /**
     * Flujo del bot
     * @type {import('@builderbot/bot').Flow<BaileysProvider, MemoryDB>}
     */
    const adapterFlow = createFlow([welcomeFlow]);

    /**
     * Proveedor de servicios de mensajería
     * @type {BaileysProvider}
     */
    const adapterProvider = createProvider(BaileysProvider, {
        groupsIgnore: true,
        readStatus: false,
    });

    /**
     * Base de datos en memoria para el bot
     * @type {MemoryDB}
     */
    const adapterDB = new MemoryDB();

    /**
     * Configuración y creación del bot
     * @type {import('@builderbot/bot').Bot<BaileysProvider, MemoryDB>}
     */
    const { httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    httpInject(adapterProvider.server);
    httpServer(+PORT);
};

main();