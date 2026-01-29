import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ScannedData } from '../content/scanner';

export async function generateAnswer(apiKey: string, resume: string, data: ScannedData): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `
Context: You are a helpful assistant for a job applicant. The user is applying for a job at "${data.companyName}" for the position of "${data.jobTitle}".
    
Job Description Snippet: 
"${data.description.substring(0, 5000)}"

User Resume:
"${resume}"

Task: Write a genuine, professional, and enthusiastic answer to the question "Why do you want to join us?" or "What interests you about this position?".

Requirements:
- Make a direct reference to the company's products, culture, or specific requirements mentioned in the job description.
- Connect these details to the user's experience/skills in the resume.
- Keep the tone personal and human, avoiding overused AI buzzwords (like "delve", "foster", "testament").
- Keep it concise (around 100-150 words).
- Output ONLY the answer text, no preamble or quotes.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    if (!text) throw new Error("Gemini returned empty response.");
    return text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorMessage = error.message || error.toString();
    throw new Error(`Gemini Error: ${errorMessage}`);
  }
}
