// src/branchUtils.ts
import * as vscode from 'vscode'
import { getGitDiff } from './git'
import { generateFromAI } from './ai'

export async function generateBranchName(description?: string): Promise<string> {
	const config = vscode.workspace.getConfiguration('git-ai')
	const requireTicket = config.get<boolean>('requireTicketNumber')

	let branchNameInput: string

	if (description) {
		// Use provided description
		branchNameInput = description
	} else {
		// Use git diff
		const diff = await getGitDiff()
		if (!diff) {
			throw new Error('No changes detected in git.')
		}
		branchNameInput = diff
	}

	const prompt = `Generate a git branch name based on the following ${description ? 'description' : 'git diff'}:

${branchNameInput}

Rules for the branch name:
1. Use only lowercase letters, numbers, and hyphens
2. No spaces, underscores, or special characters
3. Start with one of these prefixes: feature/, bugfix/, hotfix/, docs/, release/
4. Make it concise but descriptive
5. Don't use consecutive hyphens
6. Don't end with a hyphen
7. Maximum total length of 50 characters
8. Focus on the main purpose or feature being added/modified

Return ONLY the branch name, nothing else.`

	const branchName = await generateFromAI(prompt)

	// Clean up the branch name
	const cleanBranchName = sanitizeBranchName(branchName)

	if (requireTicket) {
		const ticketNumber = await promptForTicketNumber()
		const ticketPrefix = config.get<string>('ticketPrefix', '')
		return `${getPrefix(cleanBranchName)}${ticketPrefix}${ticketNumber}-${getBranchNameWithoutPrefix(cleanBranchName)}`
	}

	return cleanBranchName
}

function sanitizeBranchName(name: string): string {
	// Remove any text before the first valid prefix
	const prefixes = ['feature/', 'bugfix/', 'hotfix/', 'docs/', 'release/']
	const prefix = prefixes.find((p) => name.includes(p))
	if (!prefix) {
		return `feature/${name}` // Default to feature if no prefix found
	}

	const parts = name.split(prefix)
	let branchName = prefix + parts[parts.length - 1]

	// Clean up the branch name
	branchName = branchName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-/]/g, '-') // Replace invalid chars with hyphens
		.replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
		.replace(/-$/g, '') // Remove trailing hyphen

	// Ensure it's not too long
	if (branchName.length > 50) {
		const parts = branchName.split('/')
		const prefix = parts[0] + '/'
		const name = parts[1]?.slice(0, 50 - prefix.length)
		branchName = prefix + name?.replace(/-$/g, '')
	}

	return branchName
}

async function promptForTicketNumber(): Promise<string> {
	const ticketNumber = await vscode.window.showInputBox({
		placeHolder: 'Enter ticket number (required)',
		prompt: 'Enter the ticket number for this branch',
		validateInput: (value: string) => {
			if (!value) {
				return 'Ticket number is required'
			}
			if (!/^[A-Z0-9-]+$/i.test(value)) {
				return 'Ticket number should only contain letters, numbers, and hyphens'
			}
			return null
		}
	})

	if (!ticketNumber) {
		throw new Error('Ticket number is required')
	}

	return ticketNumber.toUpperCase()
}

function getPrefix(branchName: string): string {
	const prefixMatch = branchName.match(/^(feature|bugfix|hotfix|docs|release)\//)
	return prefixMatch ? prefixMatch[0] : 'feature/'
}

function getBranchNameWithoutPrefix(branchName: string): string {
	return branchName.replace(/^(feature|bugfix|hotfix|docs|release)\//, '')
}
