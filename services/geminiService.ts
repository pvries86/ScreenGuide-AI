import { prepareImageForGemini } from '../utils/fileUtils';
import { Language, SopOutput, RegenerationMode, IncrementalSopOutput, InstructionStep, GeminiModelOption, GuideProfile } from '../types';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const assertApiKey = (apiKey: string): void => {
    if (!apiKey) {
      throw new Error("API key is not configured. Please set it in the settings menu.");
    }
};

const responseSchema = {
  type: 'OBJECT',
  properties: {
    title: {
      type: 'STRING',
      description: "A concise and descriptive title for the Standard Operating Procedure based on the provided screenshots. Example: 'How to Create a New Email Filter in Gmail'."
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: {
            type: 'STRING',
            enum: ['text', 'image'],
            description: "The type of content: either a text instruction or an image placeholder."
          },
          content: {
            type: 'STRING',
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

const guideProfileInstructions: Record<GuideProfile, string> = {
  standard: 'Write clear, concise SOP instructions for a general business audience.',
  beginner: 'Write beginner-friendly instructions. Avoid unexplained jargon, include small orientation details, and make each action easy to follow.',
  technical: 'Write precise technical SOP instructions. Use exact UI labels where visible, preserve important technical terms, and avoid oversimplifying.',
  training: 'Write training handout instructions. Use a supportive tone, explain why key actions matter when it is visually inferable, and keep steps easy to scan.',
  checklist: 'Write compact checklist-style instructions. Prefer short imperative actions and avoid extra explanation unless needed for clarity.',
  support: 'Write support-article instructions. Focus on the user problem, expected outcome, and clear recovery-oriented actions.',
};

const getGuideProfileInstruction = (profile: GuideProfile): string => guideProfileInstructions[profile] ?? guideProfileInstructions.standard;

const normalizeModelId = (name: string): string => name.replace(/^models\//, '');

type GeminiModel = {
  name?: string;
  displayName?: string;
  description?: string;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
};

type ListModelsResponse = {
  models?: GeminiModel[];
  nextPageToken?: string;
};

type GeminiPart = {
  text: string;
} | {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message?: string;
  };
};

const buildGeminiUrl = (path: string): string => `${GEMINI_API_BASE}${path}`;

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) {
    return;
  }

  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
};

const requestGemini = async <T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> => {
  assertApiKey(apiKey);

  const response = await fetch(buildGeminiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      ...init.headers,
    },
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message = responseBody?.error?.message ?? response.statusText;
    throw new Error(`Gemini API request failed: ${message}`);
  }

  return responseBody as T;
};

const generateGeminiContent = async (
  model: string,
  apiKey: string,
  parts: GeminiPart[],
  generationConfig?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> => {
  const modelId = normalizeModelId(model);
  const response = await requestGemini<GenerateContentResponse>(
    `/models/${encodeURIComponent(modelId)}:generateContent`,
    apiKey,
    {
      method: 'POST',
      signal,
      body: JSON.stringify({
        contents: [{ parts }],
        ...(generationConfig ? { generationConfig } : {}),
      }),
    }
  );

  const responseText = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!responseText) {
    const finishReason = response.candidates?.[0]?.finishReason;
    throw new Error(finishReason ? `Gemini returned no text. Finish reason: ${finishReason}.` : 'Gemini returned no text.');
  }

  return responseText;
};

const repairJsonResponse = async (
  invalidJson: string,
  schema: Record<string, unknown>,
  model: string,
  apiKey: string,
  signal: AbortSignal | undefined,
  description: string
): Promise<string> => {
  return generateGeminiContent(
    model,
    apiKey,
    [{
      text: `Repair this Gemini response so it is valid JSON for ${description}. Return only the repaired JSON object, with no markdown or explanation.\n\nInvalid response:\n${invalidJson}`,
    }],
    {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
    signal
  );
};

const parseSopOutput = (responseText: string): SopOutput => {
  const parsedJson = JSON.parse(responseText);
  if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.steps) && parsedJson.steps.every((item: any) => 'type' in item && 'content' in item)) {
    return parsedJson as SopOutput;
  }

  throw new Error('Parsed JSON does not match expected format.');
};

const parseIncrementalOutput = (responseText: string): IncrementalSopOutput => {
  const parsedJson = JSON.parse(responseText);
  if (parsedJson && Array.isArray(parsedJson.steps)) {
    return parsedJson as IncrementalSopOutput;
  }

  throw new Error('Parsed JSON does not match expected incremental format.');
};

const getModelLabel = (model: GeminiModel): string => {
  if (model.displayName) {
    return model.displayName;
  }
  if (model.name) {
    return normalizeModelId(model.name);
  }
  return DEFAULT_GEMINI_MODEL;
};

const sortModels = (models: GeminiModelOption[]): GeminiModelOption[] => {
  return [...models].sort((a, b) => {
    if (a.id === DEFAULT_GEMINI_MODEL) return -1;
    if (b.id === DEFAULT_GEMINI_MODEL) return 1;
    return a.name.localeCompare(b.name);
  });
};

const isScreenGuideModel = (id: string): boolean => {
  const normalizedId = id.toLowerCase();
  const excludedTerms = [
    'aqa',
    'audio',
    'embedding',
    'image-generation',
    'imagen',
    'learnlm',
    'live',
    'native-audio',
    'tts',
    'veo',
  ];

  if (!normalizedId.startsWith('gemini-')) {
    return false;
  }

  if (excludedTerms.some((term) => normalizedId.includes(term))) {
    return false;
  }

  return /gemini-\d+(?:\.\d+)?-(?:flash|pro)(?:-|$)/.test(normalizedId);
};

export const listGeminiModels = async (apiKey: string): Promise<GeminiModelOption[]> => {
  const models: GeminiModelOption[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await requestGemini<ListModelsResponse>(`/models?${params.toString()}`, apiKey);

    for (const model of response.models ?? []) {
      const supportedActions = model.supportedGenerationMethods ?? model.supportedActions ?? [];
      if (!model.name || !supportedActions.includes('generateContent')) {
        continue;
      }

      const id = normalizeModelId(model.name);
      if (!isScreenGuideModel(id)) {
        continue;
      }

      models.push({
        id,
        name: getModelLabel(model),
        description: model.description,
      });
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return sortModels(models);
};

export const generateInstructions = async (
  images: File[],
  language: Language,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  signal?: AbortSignal,
  onRequestStart?: () => void,
  profile: GuideProfile = 'standard'
): Promise<SopOutput> => {
  const languageName = languageMap[language];
  const profileInstruction = getGuideProfileInstruction(profile);

  const prompt = `You are an expert technical writer specializing in creating clear, concise Standard Operating Procedures (SOPs). Your task is to analyze the following sequence of screenshots and generate a step-by-step guide.
First, create a short, descriptive title for the overall process shown in the screenshots.
Then, generate the steps. The instructions must be derived solely from the visual information in the images. The output language must be ${languageName}.
Style profile: ${profileInstruction}
Pay special attention to any on-screen annotations like red boxes or arrows, as they highlight the most important elements for the user to interact with. Your instruction should explicitly mention these highlighted elements (e.g., "Click the 'Save' button, highlighted in the red box.").
You must return the a single JSON object that strictly adheres to the provided schema, containing both the title and the array of steps. Each step can be either a text instruction or a reference to an image. For text, use the type 'text' and provide the instruction in the 'content' field. To include an image, use the type 'image' and set the 'content' to the 1-based index of the corresponding screenshot in the sequence. Ensure the image references are placed logically after the text step they illustrate.`;

  const imageParts = await Promise.all(
    images.map(async (file) => {
      throwIfAborted(signal);
      const imagePart = await prepareImageForGemini(file);
      throwIfAborted(signal);
      return {
        inlineData: {
          data: imagePart.data,
          mimeType: imagePart.mimeType,
        },
      };
    })
  );

  throwIfAborted(signal);
  onRequestStart?.();

  const responseText = await generateGeminiContent(
    model,
    apiKey,
    [{ text: prompt }, ...imageParts],
    {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    },
    signal
  );

  throwIfAborted(signal);

  try {
    return parseSopOutput(responseText);
  } catch (error) {
    console.warn("Gemini returned invalid guide JSON; attempting repair.", error);
    try {
      const repairedResponseText = await repairJsonResponse(
        responseText,
        responseSchema,
        model,
        apiKey,
        signal,
        'a screenshot guide with title and steps'
      );
      throwIfAborted(signal);
      return parseSopOutput(repairedResponseText);
    } catch (repairError) {
      console.error("Failed to parse Gemini response:", responseText, repairError);
      throw new Error("Received an invalid format from the AI. Please try again.");
    }
  }
};

const incrementalResponseSchema = {
    type: 'OBJECT',
    properties: {
        steps: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    type: {
                        type: 'STRING',
                        enum: ['text', 'image'],
                    },
                    content: {
                        type: 'STRING',
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
    context: { previousStep: string | null; nextStep: string | null },
    model: string = DEFAULT_GEMINI_MODEL,
    signal?: AbortSignal,
    onRequestStart?: () => void,
    profile: GuideProfile = 'standard'
): Promise<IncrementalSopOutput> => {
    const languageName = languageMap[language];
    const profileInstruction = getGuideProfileInstruction(profile);
    const { previousStep, nextStep } = context;

    let prompt = `You are an expert technical writer. Your task is to write a single, clear instruction for the provided screenshot, which is a new step being inserted into an existing guide. The output language must be ${languageName}.
Style profile: ${profileInstruction}
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

    throwIfAborted(signal);
    const preparedImage = await prepareImageForGemini(image);
    throwIfAborted(signal);
    const imagePart = {
        inlineData: {
            data: preparedImage.data,
            mimeType: preparedImage.mimeType,
        },
    };
    throwIfAborted(signal);
    onRequestStart?.();

    const responseText = await generateGeminiContent(
        model,
        apiKey,
        [{ text: prompt }, imagePart],
        {
            responseMimeType: 'application/json',
            responseSchema: incrementalResponseSchema,
        },
        signal
    );

    throwIfAborted(signal);

    try {
        return parseIncrementalOutput(responseText);
    } catch (error) {
        console.warn("Gemini returned invalid incremental JSON; attempting repair.", error);
        try {
            const repairedResponseText = await repairJsonResponse(
                responseText,
                incrementalResponseSchema,
                model,
                apiKey,
                signal,
                'a new guide step with text and image placeholder steps'
            );
            throwIfAborted(signal);
            return parseIncrementalOutput(repairedResponseText);
        } catch (repairError) {
            console.error("Failed to parse Gemini response for incremental step:", responseText, repairError);
            throw new Error("Received an invalid format from the AI for the new step. Please try again.");
        }
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
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  profile: GuideProfile = 'standard'
): Promise<string> => {
  const languageName = languageMap[language];
  const profileInstruction = getGuideProfileInstruction(profile);
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

  let prompt = `You are an expert technical writer. Your task is to rewrite a single instruction step. The new instruction must be in ${languageName}. Style profile: ${profileInstruction}`;

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
    const preparedImage = await prepareImageForGemini(image);
    const imagePart = {
      inlineData: {
        data: preparedImage.data,
        mimeType: preparedImage.mimeType,
      },
    };
    contentParts.push(imagePart);
  }

  return generateGeminiContent(
    model,
    apiKey,
    contentParts
  );
};
