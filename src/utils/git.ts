import { simpleGit, SimpleGit } from 'simple-git'
import * as vscode from 'vscode'

interface BranchConfig {
	prefix: string
	ticketNumber?: string | undefined
	description: string
}

export function formatBranchName(config: BranchConfig): string {
	const parts = [config.prefix]

	if (config.ticketNumber) {
		parts.push(config.ticketNumber.toUpperCase())
	}

	parts.push(config.description.toLowerCase())

	return parts.join('/')
}

export async function getGitDiff(): Promise<string | null> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders) {
		throw new Error('No workspace folder open')
	}
	if (!workspaceFolders[0]) {
		throw new Error('No workspace folder found')
	}

	const git: SimpleGit = simpleGit(workspaceFolders[0].uri.fsPath)
	const diff = await git.diff(['HEAD'])
	return diff || null
}
