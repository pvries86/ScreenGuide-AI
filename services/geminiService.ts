import { GoogleGenAI, Type } from '@google/genai';
import { fileToBase64 } from '../utils/fileUtils';
import { Language, SopOutput, RegenerationMode } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

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

export const generateInstructions = async (images: File[], language: Language): Promise<SopOutput> => {
  const languageName = language === 'en' ? 'English' : 'Dutch';

  const prompt = `You are an expert technical writer specializing in creating clear, concise Standard Operating Procedures (SOPs). Your task is to analyze the following sequence of screenshots and generate a step-by-step guide.
First, create a short, descriptive title for the overall process shown in the screenshots.
Then, generate the steps. The instructions must be derived solely from the visual information in the images. The output language must be ${languageName}.
You must return the output as a single JSON object that strictly adheres to the provided schema, containing both the title and the array of steps. Each step can be either a text instruction or a reference to an image. For text, use the type 'text' and provide the instruction in the 'content' field. To include an image, use the type 'image' and set the 'content' to the 1-based index of the corresponding screenshot in the sequence. Ensure the image references are placed logically after the text step they illustrate.`;

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


export const regenerateInstruction = async (
  image: File,
  language: Language,
  context: {
    previousStep: string | null;
    currentStep: string;
    nextStep: string | null;
  },
  mode: RegenerationMode = 'regenerate'
): Promise<string> => {
  const languageName = language === 'en' ? 'English' : 'Dutch';
  const { previousStep, currentStep, nextStep } = context;

  let modificationInstruction = '';
  switch (mode) {
    case 'shorter':
      modificationInstruction = 'Rewrite it to be more concise and to the point.';
      break;
    case 'longer':
      modificationInstruction = 'Rewrite it to be more detailed and descriptive, adding more information if possible based on the image.';
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

  let prompt = `You are an expert technical writer. Your task is to rewrite a single instruction step based on the provided screenshot. The language for the new instruction must be ${languageName}.

The current instruction is: "${currentStep}"

Your task is: ${modificationInstruction}`;

  if (previousStep) {
    prompt += `\n\nThe previous step was: "${previousStep}"`;
  }
  if (nextStep) {
    prompt += `\n\nThe next step is: "${nextStep}"`;
  }

  prompt += `\n\nAnalyze the screenshot and provide the rewritten instruction. Return ONLY the new instruction text, with no extra formatting, labels, or quotation marks.`;

  const imagePart = {
    inlineData: {
      data: await fileToBase64(image),
      mimeType: image.type,
    },
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ text: prompt }, imagePart] },
  });

  return response.text.trim();
};