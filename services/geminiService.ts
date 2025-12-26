
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Modality } from "@google/genai";
import { RouteDetails, StorySegment, StoryStyle } from "../types";
import { base64ToArrayBuffer, pcmToWav } from "./audioUtils";

const RAW_API_KEY = process.env.API_KEY;
const API_KEY = RAW_API_KEY ? RAW_API_KEY.replace(/["']/g, "").trim() : "";

const ai = new GoogleGenAI({ apiKey: API_KEY });

const TARGET_SEGMENT_DURATION_SEC = 60; 
const WORDS_PER_MINUTE = 180; // Adjusted for Chinese characters
const CHARS_PER_SEGMENT = Math.round((TARGET_SEGMENT_DURATION_SEC / 60) * WORDS_PER_MINUTE);

export const calculateTotalSegments = (durationSeconds: number): number => {
    return Math.max(1, Math.ceil(durationSeconds / TARGET_SEGMENT_DURATION_SEC));
};

const getStyleInstruction = (style: StoryStyle): string => {
    switch (style) {
        case 'NOIR':
            return "風格：黑色追緝 (Noir Thriller)。語氣冷峻、犬儒且富有大氣感。使用內心獨白，將旅人塑造成一位偵探或背負沉重過去的角色。城市本身就是一個角色——陰暗、潮濕、隱藏著無數秘密。運用陰影、煙霧、霓虹冷光的隱喻。";
        case 'CHILDREN':
            return "風格：童話世界 (Children's Story)。充滿幻想、奇妙且富有童趣。世界是明亮且充滿生命的；或許無生命物（如紅綠燈或路樹）都有微妙的個性。語言簡潔但極具感染力。展現一種愉悅的探索感。";
        case 'HISTORICAL':
            return "風格：歷史史詩 (Historical Epic)。莊嚴、戲劇化且跨越時空。將這段旅程視為一場在過去時代（即便在現代背景下）具備重大意義的朝聖或遠征。使用略微優雅、帶有古風但易於理解的辭藻。專注於耐力、命運與歷史的沉重感。";
        case 'FANTASY':
            return "風格：奇幻冒險 (Fantasy Adventure)。英雄式、神秘且宏大。現實世界只是魔法疆域的面紗。街道是古老的小徑，建築是高塔或遺跡。旅人正執行一項至關重要的任務。使用魔法、神話生物（陰影可能是潛伏的怪獸）與天命的隱喻。";
        default:
            return "風格：沉浸式敘事。專注於移動的感覺與周遭環境的細微變化。";
    }
};

export const generateStoryOutline = async (
    route: RouteDetails,
    totalSegments: number
): Promise<string[]> => {
    const styleInstruction = getStyleInstruction(route.storyStyle);
    const prompt = `
    您是一位頂尖的文學小說家與編劇。請為一段正好分為 ${totalSegments} 個章節的旅程編寫故事大綱。
    這段故事必須具備完整的敘事弧線：開場、導火線、衝突升高、高潮、轉折、收尾與結局。

    請根據以下旅程資訊進行客製化創作：
    旅程：從 ${route.startAddress} 到 ${route.endAddress}，交通工具為 ${route.travelMode === 'WALKING' ? '步行' : '開車'}。
    總預計時間：約 ${route.duration}。
    所需章節數量：${totalSegments}。
    
    ${styleInstruction}

    請務必使用 **繁體中文** 創作。
    輸出格式必須為嚴格的 JSON 陣列，包含 ${totalSegments} 個字串。
    例如：["第一章節摘要...", "第二章節摘要...", ...]
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });

        const text = response.text?.trim();
        if (!text) throw new Error("無法生成大綱。");
        
        const outline = JSON.parse(text);
        if (!Array.isArray(outline) || outline.length === 0) {
             throw new Error("接收到的 JSON 格式無效。");
        }

        while (outline.length < totalSegments) {
            outline.push("繼續這段沉浸式的旅程。");
        }

        return outline.slice(0, totalSegments);

    } catch (error) {
        console.error("Outline Generation Error:", error);
        return Array(totalSegments).fill("繼續這段關於移動與探索的敘事。");
    }
};

export const generateSegment = async (
    route: RouteDetails,
    segmentIndex: number,
    totalSegmentsEstimate: number,
    segmentOutline: string,
    previousContext: string = ""
): Promise<StorySegment> => {

  const isFirst = segmentIndex === 1;

  let contextPrompt = "";
  if (!isFirst) {
      contextPrompt = `
      前情提要（故事目前的進展）：
      ...${previousContext.slice(-1000)} 
      （請從上述內容自然地無縫銜接。不要重複內容。避免每次都使用「於是...」或「接著...」等過於重複的連接詞。）
      `;
  }

  const styleInstruction = getStyleInstruction(route.storyStyle);

  const prompt = `
    您是一個 AI 故事引擎，正在為一位旅人生成連續且沉浸式的語音串流。
    旅程：從 ${route.startAddress} 到 ${route.endAddress}。
    目前進度：第 ${segmentIndex} 章，共約 ${totalSegmentsEstimate} 章。
    
    ${styleInstruction}

    當前章節目標：${segmentOutline}

    ${contextPrompt}

    任務：請撰寫一段長度約為 ${TARGET_SEGMENT_DURATION_SEC} 秒的敘事文字（約 ${CHARS_PER_SEGMENT} 個中文字）。
    請讓敘事不斷推進，這是一個長途旅程中的過渡片段，要具備流動感。

    重要要求：
    1. 必須使用 **繁體中文**。
    2. 文筆要優美、流暢，適合朗讀。
    3. 只輸出純敘事文字，不要包含標題、章節編號或任何 JSON 標籤。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) throw new Error("無法生成章節文字。");

    return {
      index: segmentIndex,
      text: text,
      audioBuffer: null 
    };

  } catch (error) {
    console.error(`Segment ${segmentIndex} Text Generation Error:`, error);
    throw error;
  }
};

export const generateSegmentAudio = async (text: string, audioContext: AudioContext, voiceName: string = 'Kore'): Promise<AudioBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;
    if (!audioData) throw new Error("未收到 TTS 語音數據。");

    const mimeType = part?.inlineData?.mimeType || "audio/pcm;rate=24000";
    const match = mimeType.match(/rate=(\d+)/);
    const sampleRate = match ? parseInt(match[1], 10) : 24000;

    const wavArrayBuffer = await pcmToWav(base64ToArrayBuffer(audioData), sampleRate).arrayBuffer();
    return await audioContext.decodeAudioData(wavArrayBuffer);

  } catch (error) {
    console.error("Audio Generation Error:", error);
    throw error;
  }
};
