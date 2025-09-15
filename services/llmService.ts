import { GoogleGenAI, Type } from '@google/genai';
import { fileToBase64, fileToDataUrl } from '../utils/fileUtils';
import { Language, SopOutput, RegenerationMode, IncrementalSopOutput, LLMProvider, ApiKeys } from '../types';

// --- Generic Error Handling ---
class LLMError extends Error {
  constructor(message: string, public provider: LLMProvider) {
    super(message);
    this.name = 'LLMError';
  }
}

// --- Gemini Provider ---
const generateWithGemini = async (images: File[], language: Language, apiKey: string): Promise<SopOutput> => {
    const ai = new GoogleGenAI({ apiKey });
    const languageName = language === 'en' ? 'English' : 'Dutch';

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            steps: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, enum: ['text', 'image'] },
                        content: { type: Type.STRING }
                    },
                    required: ['type', 'content']
                }
            }
        },
        required: ['title', 'steps']
    };

    const prompt = `You are an expert technical writer. Analyze the following screenshots and generate a step-by-step guide.
    First, create a short, descriptive title for the process.
    Then, generate the steps. The instructions must be derived solely from the visual information. The output language must be ${languageName}.
    Pay special attention to any on-screen annotations like red boxes or arrows, as they highlight important elements. Your instruction should explicitly mention these highlighted elements.
    You must return a single JSON object that strictly adheres to the provided schema, containing the title and the array of steps. For an image, use type 'image' and set 'content' to the 1-based index of the screenshot. Place image references logically after the text they illustrate.`;

    const imageParts = await Promise.all(images.map(async (file) => ({
        inlineData: { data: await fileToBase64(file), mimeType: file.type }
    })));

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const parsedJson = JSON.parse(response.text.trim());
        if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.steps)) {
            return parsedJson;
        }
        throw new Error('Parsed JSON does not match expected format.');
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new LLMError(error instanceof Error ? error.message : "An unknown error occurred with Gemini", 'gemini');
    }
};

// --- OpenAI / Perplexity Provider (Shared Logic) ---
const generateWithOpenAICompatible = async (images: File[], language: Language, provider: 'openai' | 'perplexity', apiKey: string): Promise<SopOutput> => {
    const endpoint = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.perplexity.ai/chat/completions';
    const model = provider === 'openai' ? 'gpt-4o' : 'llama-3-sonar-large-32k-online';
    const languageName = language === 'en' ? 'English' : 'Dutch';

    const prompt = `You are an expert technical writer. Analyze the following sequence of screenshots and generate a step-by-step guide.
    First, create a short, descriptive title for the overall process.
    Then, generate the steps. The instructions must be in ${languageName} and derived solely from the visual information.
    Pay special attention to any on-screen annotations like red boxes or arrows. Refer to these highlights in your instructions.
    You must return a single, valid JSON object with the keys "title" (string) and "steps" (an array of objects). Each step object must have a "type" ('text' or 'image') and "content" (the instruction text, or the 1-based index of the image as a string). Place image references logically after the text they illustrate.
    Example: { "title": "Example Title", "steps": [{ "type": "text", "content": "First, do this." }, { "type": "image", "content": "1" }] }`;

    const imageContent = await Promise.all(images.map(async (file) => ({
        type: "image_url",
        image_url: { url: await fileToDataUrl(file) }
    })));

    const body = {
        model,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "user",
                content: [{ type: "text", text: prompt }, ...imageContent]
            }
        ]
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error?.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const jsonContent = JSON.parse(data.choices[0].message.content);
        if (jsonContent && typeof jsonContent.title === 'string' && Array.isArray(jsonContent.steps)) {
            return jsonContent;
        }
        throw new Error("Invalid JSON structure received from API.");
    } catch (error) {
        console.error(`${provider} API Error:`, error);
        throw new LLMError(error instanceof Error ? error.message : `An unknown error occurred with ${provider}`, provider);
    }
};

// --- Anthropic Provider ---
const generateWithAnthropic = async (images: File[], language: Language, apiKey: string): Promise<SopOutput> => {
    const languageName = language === 'en' ? 'English' : 'Dutch';
    const prompt = `You are an expert technical writer. Analyze the following sequence of screenshots and generate a step-by-step guide.
    First, create a short, descriptive title for the overall process.
    Then, generate the steps. The instructions must be in ${languageName} and derived solely from the visual information.
    Pay special attention to any on-screen annotations like red boxes or arrows. Refer to these highlights in your instructions.
    You must return ONLY a single, valid JSON object inside <json> tags with the keys "title" (string) and "steps" (an array of objects). Each step object must have a "type" ('text' or 'image') and "content" (the instruction text, or the 1-based index of the image as a string). Place image references logically after the text they illustrate.
    Example: <json>{ "title": "Example Title", "steps": [{ "type": "text", "content": "First, do this." }, { "type": "image", "content": "1" }] }</json>`;

    const imageContent = await Promise.all(images.map(async (file) => ({
        type: "image",
        source: { type: "base64", media_type: file.type, data: await fileToBase64(file) }
    })));

    const body = {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }]
    };

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error?.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const textContent = data.content[0].text;
        const jsonMatch = textContent.match(/<json>([\s\S]*?)<\/json>/);
        if (!jsonMatch) throw new Error("No JSON block found in the response.");
        const parsedJson = JSON.parse(jsonMatch[1]);
        if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.steps)) {
            return parsedJson;
        }
        throw new Error("Invalid JSON structure received from API.");
    } catch (error) {
        console.error("Anthropic API Error:", error);
        throw new LLMError(error instanceof Error ? error.message : "An unknown error occurred with Anthropic", 'anthropic');
    }
};

// --- Main Dispatcher Function ---
export const generateInstructions = async (
    images: File[], 
    language: Language, 
    provider: LLMProvider, 
    apiKeys: ApiKeys
): Promise<SopOutput> => {
    const apiKey = apiKeys[provider];
    if (!apiKey) throw new LLMError(`API key for ${provider} is not configured.`, provider);
    
    switch (provider) {
        case 'gemini':
            return generateWithGemini(images, language, apiKey);
        case 'openai':
        case 'perplexity':
            return generateWithOpenAICompatible(images, language, provider, apiKey);
        case 'anthropic':
            return generateWithAnthropic(images, language, apiKey);
        default:
            throw new Error(`Unsupported LLM provider: ${provider}`);
    }
};

// --- TODO: Multi-provider support for incremental and regeneration functions ---
// For now, these will remain Gemini-only to fulfill the core request.
// They can be expanded later using the same dispatcher pattern.

export const generateIncrementalInstruction = async (
    image: File, language: Language, provider: LLMProvider, apiKeys: ApiKeys,
    context: { previousStep: string | null; nextStep: string | null }
): Promise<IncrementalSopOutput> => {
    const apiKey = apiKeys.gemini;
    if (!apiKey) throw new LLMError("Gemini API key is required for merging.", 'gemini');
    const ai = new GoogleGenAI({ apiKey });
    const languageName = language === 'en' ? 'English' : 'Dutch';

    let prompt = `You are an expert technical writer. Write a single instruction for the provided screenshot, which is a new step being inserted into a guide. The language must be ${languageName}. Refer to any annotations. The instruction must logically connect the previous and next steps.`;
    if (context.previousStep) prompt += `\n\nPREVIOUS STEP: "${context.previousStep}"`;
    else prompt += `\n\nThis is the NEW FIRST STEP.`;
    if (context.nextStep) prompt += `\n\nNEXT STEP: "${context.nextStep}"`;
    else prompt += `\n\nThis is the NEW LAST STEP.`;
    prompt += `\n\nYou must return a JSON object with a 'steps' array, containing one 'text' step and one 'image' step. For the 'image' step's content, use the placeholder "INSERT_IMAGE_HERE".`;
    
    const schema = { type: Type.OBJECT, properties: { steps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, content: { type: Type.STRING } } } } }, required: ['steps'] };
    const imagePart = { inlineData: { data: await fileToBase64(image), mimeType: image.type } };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }, imagePart] },
        config: { responseMimeType: 'application/json', responseSchema: schema },
    });
    return JSON.parse(response.text.trim());
};

export const regenerateInstruction = async (
  provider: LLMProvider, apiKeys: ApiKeys, image: File | null, language: Language,
  context: { previousStep: string | null; currentStep: string; nextStep: string | null; },
  mode: RegenerationMode = 'regenerate'
): Promise<string> => {
    const apiKey = apiKeys.gemini;
    if (!apiKey) throw new LLMError("Gemini API key is required for regeneration.", 'gemini');
    const ai = new GoogleGenAI({ apiKey });
    const languageName = language === 'en' ? 'English' : 'Dutch';
    
    let modificationInstruction: string;
    switch (mode) {
        case 'shorter': modificationInstruction = 'Rewrite it to be more concise.'; break;
        case 'longer': modificationInstruction = 'Rewrite it to be more detailed.'; break;
        case 'simpler': modificationInstruction = 'Rewrite it in simpler terms for a beginner.'; break;
        case 'professional': modificationInstruction = 'Rewrite it using formal, professional language.'; break;
        default: modificationInstruction = 'Provide a new version of this instruction.'; break;
    }
    
    let prompt = `You are an expert technical writer. Rewrite a single instruction step in ${languageName}. The current instruction is: "${context.currentStep}".`;
    if (context.previousStep) prompt += `\nPrevious step: "${context.previousStep}"`;
    if (context.nextStep) prompt += `\nNext step: "${context.nextStep}"`;
    prompt += `\nYour task: ${modificationInstruction}. Return ONLY the new instruction text, with no extra formatting or quotation marks.`;

    const contentParts: ({ text: string; } | { inlineData: { data: string; mimeType: string; }; })[] = [{ text: prompt }];
    if (image) {
        contentParts.push({ inlineData: { data: await fileToBase64(image), mimeType: image.type } });
    }

    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: contentParts } });
    return response.text.trim();
};
