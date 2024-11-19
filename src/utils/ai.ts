import * as vscode from 'vscode'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

interface AIConfig {
	anthropicApiKey?: string | undefined
	openaiApiKey?: string | undefined
	ollamaHost?: string | undefined
	preferredModel: string
	ollamaModel: string
}

interface OllamaResponse {
	response: string
}

interface AIConfig {
	anthropicApiKey?: string
	openaiApiKey?: string
	ollamaHost?: string
	preferredModel: string
	ollamaModel: string
}

interface CommitDetails {
	message: string
	name: string
}

export async function generateFromAI(prompt: string): Promise<string> {
	const config = getConfig()

	switch (config.preferredModel) {
		case 'claude-3.5-sonnet':
		case 'claude-3-opus':
		case 'claude-3-haiku':
			return await generateAnthropicResponse(prompt, config)

		case 'gpt-4o':
		case 'gpt-4o-mini':
			return await generateOpenAIResponse(prompt, config)

		case 'ollama':
			return await generateOllamaResponse(prompt, config)

		default:
			throw new Error('Invalid model selection')
	}
}

export async function generateCommitMessage(diff: string): Promise<CommitDetails> {
	const prompt = `Given the following git diff, generate two things:
1. A concise commit name following conventional commits (type(optional-scope): brief-description)
2. A detailed commit message following the Conventional Commits 1.0.0 specification.

Use one of these types: feat, fix, docs, style, refactor, perf, test, build, ci, chore.
Include a scope if appropriate.

The commit name should be a single line.
The commit message should be in this format:
type(optional-scope): description

[optional body]

[optional footer]

Include BREAKING CHANGE: footer or ! after type/scope for breaking changes.

Git diff:
${diff}

Respond in this exact format:
COMMIT_NAME: type(scope): brief-description
COMMIT_MESSAGE: 
<full commit message here>
`

	const response = await generateFromAI(prompt)
	const parts = response.split('COMMIT_MESSAGE:')

	if (parts.length !== 2) {
		throw new Error('Invalid AI response format')
	}

	const name = parts[0]?.replace('COMMIT_NAME:', '').trim() || ''
	const message = parts[1]?.replace(name, '').trim() || ''

	return {
		name,
		message
	}
}

async function generateAnthropicResponse(prompt: string, config: AIConfig): Promise<string> {
	if (!config.anthropicApiKey) {
		throw new Error('Anthropic API key not configured')
	}

	const anthropic = new Anthropic({
		apiKey: config.anthropicApiKey
	})

	const response = await anthropic.messages.create({
		model: config.preferredModel,
		max_tokens: 300,
		messages: [
			{
				role: 'user',
				content: prompt
			}
		]
	})

	const content = response.content[0]
	if (!content) {
		throw new Error('No response from Anthropic')
	}

	return content.text.trim()
}

async function generateOpenAIResponse(prompt: string, config: AIConfig): Promise<string> {
	if (!config.openaiApiKey) {
		throw new Error('OpenAI API key not configured')
	}

	const openai = new OpenAI({
		apiKey: config.openaiApiKey
	})

	const response = await openai.chat.completions.create({
		model: config.preferredModel === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini',
		messages: [
			{
				role: 'user',
				content: prompt
			}
		],
		max_tokens: 300
	})

	const content = response.choices[0]?.message?.content
	if (!content) {
		throw new Error('No response from OpenAI')
	}

	return content.trim()
}

async function generateOllamaResponse(prompt: string, config: AIConfig): Promise<string> {
	const response = await fetch(`${config.ollamaHost}/api/generate`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: config.ollamaModel,
			prompt: prompt,
			stream: false
		})
	})

	if (!response.ok) {
		throw new Error('Failed to communicate with Ollama')
	}

	const data = await response.json()
	return (data as OllamaResponse).response.trim()
}

function getConfig(): AIConfig {
	const config = vscode.workspace.getConfiguration('git-ai')
	return {
		anthropicApiKey: config.get('anthropicApiKey'),
		openaiApiKey: config.get('openaiApiKey'),
		ollamaHost: config.get('ollamaHost'),
		preferredModel: config.get('preferredModel') || 'claude-3.5-sonnet',
		ollamaModel: config.get('ollamaModel') || 'llama2'
	}
}
