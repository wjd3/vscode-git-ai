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

export async function generateCommitMessage(diff: string): Promise<string> {
	const config = getConfig()

	const prompt = `Given the following git diff, generate a concise, descriptive commit message following the Conventional Commits 1.0.0 specification. Use one of these types: feat, fix, docs, style, refactor, perf, test, build, ci, chore. Include a scope if appropriate. Format should be:
type(optional-scope): description

[optional body]

[optional footer]

Include BREAKING CHANGE: footer or ! after type/scope for breaking changes.

Git diff:

${diff}

Generate a commit message that clearly describes the changes.`

	switch (config.preferredModel) {
		case 'claude-3.5-sonnet':
		case 'claude-3-opus':
		case 'claude-3-haiku':
			return await generateAnthropicCommit(prompt, config)
		case 'gpt-4o':
		case 'gpt-4o-mini':
			return await generateOpenAICommit(prompt, config)
		case 'ollama':
			return await generateOllamaCommit(prompt, config)
		default:
			throw new Error('No model selected.')
	}
}

async function generateAnthropicCommit(prompt: string, config: AIConfig): Promise<string> {
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

	const content = response.content[0]?.text
	if (!content) {
		throw new Error('No response content from Anthropic')
	}
	return content
}

async function generateOpenAICommit(prompt: string, config: AIConfig): Promise<string> {
	if (!config.openaiApiKey) {
		throw new Error('OpenAI API key not configured')
	}

	const openai = new OpenAI({
		apiKey: config.openaiApiKey
	})

	const response = await openai.chat.completions.create({
		model: config.preferredModel,
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
		throw new Error('No response content from OpenAI')
	}
	return content
}

async function generateOllamaCommit(prompt: string, config: AIConfig): Promise<string> {
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

	const data = (await response.json()) as OllamaResponse
	if (!data.response) {
		throw new Error('Invalid response from Ollama')
	}
	return data.response
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
