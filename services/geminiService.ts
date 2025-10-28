import { GoogleGenAI, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";

// IMPORTANT: Assumes process.env.API_KEY is available in the environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const generateSpeech = async (text: string, temperature: number): Promise<string> => {
    const prompt = text;
  
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Charon' },
                    },
                },
                temperature: temperature,
            },
        });
        
        if (response.promptFeedback?.blockReason) {
            console.error("Content blocked by API:", JSON.stringify(response.promptFeedback, null, 2));
            throw new Error(`PROHIBITED_CONTENT: ${response.promptFeedback.blockReason}`);
        }

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!base64Audio) {
            console.error("API response did not contain audio data:", JSON.stringify(response, null, 2));
            throw new Error("No audio data received from API.");
        }

        return base64Audio;
    } catch (error) {
        console.error("Gemini API call failed:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to generate speech from Gemini API.");
    }
};

export const rewriteStory = async (text: string): Promise<string> => {
    const model = 'gemini-2.5-flash';
    const prompt = `You are an expert content moderator. Your task is to revise the following text to make it suitable for a general audience.
The text must be rewritten to comply with a strict safety policy, removing any themes related to harassment, hate speech, sexually explicit content, or dangerous acts.
Preserve the core story and meaning, but replace common profanity with partially censored versions that are easily understood (e.g., "Asshole" becomes "A-hole", "shit" becomes "s**t", "fuck" becomes "f***").
Return ONLY the rewritten text. Do not add any commentary.

Original Text:
---
${text}
---

Rewritten Text:`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            // Adjust safety settings to allow the model to process the potentially problematic input text for the purpose of rewriting it.
            // This makes the fixer more robust.
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
            ],
        });

        if (response.promptFeedback?.blockReason) {
            console.error("Rewritten content was blocked by API:", JSON.stringify(response.promptFeedback, null, 2));
            throw new Error(`REWRITE_BLOCKED: ${response.promptFeedback.blockReason}`);
        }
        
        const rewrittenText = response.text;
        
        if (!rewrittenText) {
            console.error("API response did not contain rewritten text:", JSON.stringify(response, null, 2));
            throw new Error("No rewritten text received from API.");
        }

        return rewrittenText.trim();
    } catch (error) {
        console.error("Gemini API call for rewrite failed:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Failed to rewrite story from Gemini API.");
    }
};

export const generateStoryTitle = async (text: string): Promise<string> => {
    const model = 'gemini-2.5-flash';
    const prompt = `Summarize the following text into a short, 4-6 word, filesystem-friendly filename.
    - Use hyphens instead of spaces.
    - Use only lowercase letters, numbers, and hyphens.
    - Do not include any file extension.
    - Example: "my-sisters-wedding-drama"

    TEXT:
    ---
    ${text}
    ---
    
    FILENAME:`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });

        const title = response.text?.trim() || 'story';

        // Sanitize the filename one last time to be safe
        return title
            .toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/[^a-z0-9-]/g, ''); // Remove any non-alphanumeric characters except hyphens

    } catch (error) {
        console.error("Gemini API call for title generation failed:", error);
        // Fallback to a generic name on error
        return 'story';
    }
};