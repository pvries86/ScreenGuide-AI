import { GoogleGenAI, Type } from '@google/genai';
import { fileToBase64 } from '../utils/fileUtils';
import { Language, SopOutput, RegenerationMode, IncrementalSopOutput, InstructionStep } from '../types';

const getAiClient = (apiKey: string): GoogleGenAI => {
    if (!apiKey) {
      throw new Error("API key is not configured. Please set it in the settings menu.");
    }
    return new GoogleGenAI({ apiKey });
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A concise and descriptive title for the Standard Operating Procedure based on the provided screenshots. Example: 'How to Create a New Email Filter in Gmail'."
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['text', 'image'],
            description: "The type of content: either a text instruction or an image placeholder."
          },
          content: {
            type: Type.STRING,
            description: "If type is 'text', this is the instruction. If type is 'image', this is the 1-based index of the screenshot."
          }
        },
        required: ['type', 'content']
      }
    }
  },
  required: ['title', 'steps']
};

const languageMap: Record<Language, string> = {
  en: 'English',
  nl: 'Dutch',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  li: 'Limburgish',
};

export const generateInstructions = async (images: File[], language: Language, apiKey: string): Promise<SopOutput> => {
  const ai = getAiClient(apiKey);
  const languageName = languageMap[language];

  const prompt = `You are an expert technical writer specializing in creating clear, concise Standard Operating Procedures (SOPs). Your task is to analyze the following sequence of screenshots and generate a step-by-step guide.
First, create a short, descriptive title for the overall process shown in the screenshots.
Then, generate the steps. The instructions must be derived solely from the visual information in the images. The output language must be ${languageName}.
Pay special attention to any on-screen annotations like red boxes or arrows, as they highlight the most important elements for the user to interact with. Your instruction should explicitly mention these highlighted elements (e.g., "Click the 'Save' button, highlighted in the red box.").
You must return the a single JSON object that strictly adheres to the provided schema, containing both the title and the array of steps. Each step can be either a text instruction or a reference to an image. For text, use the type 'text' and provide the instruction in the 'content' field. To include an image, use the type 'image' and set the 'content' to the 1-based index of the corresponding screenshot in the sequence. Ensure the image references are placed logically after the text step they illustrate.`;

  const imageParts = await Promise.all(
    images.map(async (file) => {
      const base64Data = await fileToBase64(file);
      return {
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      };
    })
  );

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ text: prompt }, ...imageParts] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    },
  });

  const responseText = response.text.trim();
  try {
    const parsedJson = JSON.parse(responseText);
    // Basic validation to ensure it's an array of instruction steps
    if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.steps) && parsedJson.steps.every((item: any) => 'type' in item && 'content' in item)) {
        return parsedJson as SopOutput;
    }
    throw new Error('Parsed JSON does not match expected format.');
  } catch (error) {
    console.error("Failed to parse Gemini response:", responseText);
    throw new Error("Received an invalid format from the AI. Please try again.");
  }
};

const incrementalResponseSchema = {
    type: Type.OBJECT,
    properties: {
        steps: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: {
                        type: Type.STRING,
                        enum: ['text', 'image'],
                    },
                    content: {
                        type: Type.STRING,
                        description: "If type is 'text', this is the instruction. If type is 'image', this is the 1-based index of the screenshot (use the placeholder 'INSERT_IMAGE_HERE' as the index will be calculated later)."
                    }
                },
                required: ['type', 'content']
            }
        }
    },
    required: ['steps']
};

export const generateIncrementalInstruction = async (
    image: File,
    language: Language,
    apiKey: string,
    context: { previousStep: string | null; nextStep: string | null }
): Promise<IncrementalSopOutput> => {
    const ai = getAiClient(apiKey);
    const languageName = languageMap[language];
    const { previousStep, nextStep } = context;

    let prompt = `You are an expert technical writer. Your task is to write a single, clear instruction for the provided screenshot, which is a new step being inserted into an existing guide. The output language must be ${languageName}.
The screenshot may have annotations like red boxes or arrows; your instruction should reference them.
Your generated instruction must logically connect the previous and next steps in the guide.`;

    if (previousStep) {
        prompt += `\n\nTHE PREVIOUS STEP WAS: "${previousStep}"`;
    } else {
        prompt += `\n\nThis is the NEW FIRST STEP of the guide.`;
    }

    if (nextStep) {
        prompt += `\n\nTHE NEXT STEP IS: "${nextStep}"`;
    } else {
        prompt += `\n\nThis is the NEW LAST STEP of the guide.`;
    }

    prompt += `\n\nYou must return a single JSON object that strictly adheres to the provided schema. The JSON object should contain a 'steps' array. This array should include one 'text' step for the instruction, followed by one 'image' step. For the 'image' step's content, use the exact placeholder string "INSERT_IMAGE_HERE".`;

    const imagePart = {
        inlineData: {
            data: await fileToBase64(image),
            mimeType: image.type,
        },
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }, imagePart] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: incrementalResponseSchema,
        },
    });

    const responseText = response.text.trim();
    try {
        const parsedJson = JSON.parse(responseText);
        if (parsedJson && Array.isArray(parsedJson.steps)) {
            return parsedJson as IncrementalSopOutput;
        }
        throw new Error('Parsed JSON does not match expected incremental format.');
    } catch (error) {
        console.error("Failed to parse Gemini response for incremental step:", responseText);
        throw new Error("Received an invalid format from the AI for the new step. Please try again.");
    }
};

export const regenerateInstruction = async (
  image: File | null,
  language: Language,
  context: {
    previousStep: string | null;
    currentStep: string;
    nextStep: string | null;
  },
  mode: RegenerationMode = 'regenerate',
  apiKey: string
): Promise<string> => {
  const ai = getAiClient(apiKey);
  const languageName = languageMap[language];
  const { previousStep, currentStep, nextStep } = context;

  let modificationInstruction = '';
  switch (mode) {
    case 'shorter':
      modificationInstruction = 'Rewrite it to be more concise and to the point.';
      break;
    case 'longer':
      modificationInstruction = image
        ? 'Rewrite it to be more detailed and descriptive, adding more information if possible based on the image.'
        : 'Rewrite it to be more detailed and descriptive.';
      break;
    case 'simpler':
      modificationInstruction = 'Rewrite it in simpler terms, as if explaining to a non-technical user or a complete beginner.';
      break;
    case 'professional':
      modificationInstruction = 'Rewrite it using more formal and professional technical language.';
      break;
    case 'regenerate':
    default:
      modificationInstruction = 'Provide a new version of this instruction.';
      break;
  }

  let prompt = `You are an expert technical writer. Your task is to rewrite a single instruction step. The new instruction must be in ${languageName}.`;

  if (image) {
    prompt += ` The instruction should be based on the provided screenshot. The screenshot may contain annotations like red boxes or arrows highlighting the key element. Refer to these highlights in your rewritten instruction.`;
  } else {
    prompt += ` The instruction should be rewritten based on its content and the surrounding context provided.`;
  }

  prompt += `\n\nThe current instruction is: "${currentStep}"`;

  if (previousStep) {
    prompt += `\n\nThe previous step was: "${previousStep}"`;
  }
  if (nextStep) {
    prompt += `\n\nThe next step is: "${nextStep}"`;
  }

  prompt += `\n\nYour task is: ${modificationInstruction}`;

  prompt += `\n\nReturn ONLY the new instruction text, with no extra formatting, labels, or quotation marks.`;

  // FIX: Explicitly type `contentParts` to allow both text and image parts.
  const contentParts: ({ text: string; } | { inlineData: { data: string; mimeType: string; }; })[] = [{ text: prompt }];
  if (image) {
    const imagePart = {
      inlineData: {
        data: await fileToBase64(image),
        mimeType: image.type,
      },
    };
    contentParts.push(imagePart);
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: contentParts },
  });

  return response.text.trim();
};