import { llmsTxt, text } from '../lib/llms'

export const GET = async () => text(await llmsTxt())
