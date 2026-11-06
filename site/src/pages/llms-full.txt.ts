import { llmsFullTxt, text } from '../lib/llms'

export const GET = async () => text(await llmsFullTxt())
