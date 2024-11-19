import * as vscode from 'vscode'
import { getGitDiff } from './utils/git'
import { generateCommitMessage } from './utils/ai'
import { formatBranchName } from './utils/git'
import simpleGit from 'simple-git'

export function activate(context: vscode.ExtensionContext) {
	// Add branch creation command
	// Configuration commands
	const setApiKey = vscode.commands.registerCommand('git-ai.setApiKey', async () => {
		const provider = await vscode.window.showQuickPick(['Anthropic', 'OpenAI'], {
			placeHolder: 'Select API provider'
		})

		if (!provider) return

		const key = await vscode.window.showInputBox({
			password: true,
			placeHolder: `Enter your ${provider} API key`,
			ignoreFocusOut: true
		})

		if (!key) return

		const config = vscode.workspace.getConfiguration('git-ai')
		const setting = provider.toLowerCase() === 'anthropic' ? 'anthropicApiKey' : 'openaiApiKey'
		await config.update(setting, key, vscode.ConfigurationTarget.Global)

		vscode.window.showInformationMessage(`${provider} API key updated`)
	})

	const changeModel = vscode.commands.registerCommand('git-ai.changeModel', async () => {
		const config = vscode.workspace.getConfiguration('git-ai')
		const currentModel = config.get<string>('preferredModel')

		const models = [
			'claude-3.5-sonnet',
			'claude-3-opus',
			'claude-3-haiku',
			'gpt-4o',
			'gpt-4o-mini',
			'ollama'
		]

		const model = await vscode.window.showQuickPick(
			models.map((model) => ({
				label: model,
				description: model === currentModel ? '(current)' : ''
			})),
			{
				placeHolder: `Select preferred model (current: ${currentModel})`,
				ignoreFocusOut: true
			}
		)

		if (!model) {
			return
		}

		if (model.label === currentModel) {
			vscode.window.showInformationMessage(`Model is already set to ${model.label}`)
			return
		}

		await config.update('preferredModel', model.label, vscode.ConfigurationTarget.Global)
		vscode.window.showInformationMessage(`Preferred model changed to ${model.label}`)
	})

	const configureBranch = vscode.commands.registerCommand('git-ai.configureBranch', async () => {
		const config = vscode.workspace.getConfiguration('git-ai')

		const settings = [
			'Require Ticket Number',
			'Ticket Prefix',
			'Default Branch Prefix',
			'Custom Branch Prefixes'
		]

		const setting = await vscode.window.showQuickPick(settings, {
			placeHolder: 'Select setting to configure'
		})

		if (!setting) return

		switch (setting) {
			case 'Require Ticket Number': {
				const value = await vscode.window.showQuickPick(['Yes', 'No'], {
					placeHolder: 'Require ticket number for branches?'
				})
				if (value) {
					await config.update(
						'requireTicketNumber',
						value === 'Yes',
						vscode.ConfigurationTarget.Global
					)
				}
				break
			}
			case 'Ticket Prefix': {
				const value = await vscode.window.showInputBox({
					placeHolder: 'Enter ticket prefix (e.g., JIRA-)',
					value: config.get('ticketPrefix') || ''
				})
				if (value) {
					await config.update('ticketPrefix', value, vscode.ConfigurationTarget.Global)
				}
				break
			}
			case 'Default Branch Prefix': {
				const prefixes = ['feature', 'bugfix', 'hotfix', 'release', 'docs']
				const value = await vscode.window.showQuickPick(prefixes, {
					placeHolder: 'Select default branch prefix'
				})
				if (value) {
					await config.update('defaultBranchPrefix', value, vscode.ConfigurationTarget.Global)
				}
				break
			}
			case 'Custom Branch Prefixes': {
				const current = config.get<string[]>('customBranchPrefixes', [])
				const value = await vscode.window.showInputBox({
					placeHolder: 'Enter comma-separated prefixes',
					value: current.join(', ')
				})
				if (value) {
					const prefixes = value
						.split(',')
						.map((p) => p.trim())
						.filter(Boolean)
					await config.update('customBranchPrefixes', prefixes, vscode.ConfigurationTarget.Global)
				}
				break
			}
		}
	})

	context.subscriptions.push(
		setApiKey,
		changeModel,
		configureBranch,
		vscode.commands.registerCommand('git-ai.createBranch', async () => {
			try {
				const branchTypes = ['feature', 'bugfix', 'hotfix', 'release', 'docs']

				const branchType = await vscode.window.showQuickPick(branchTypes, {
					placeHolder: 'Select branch type'
				})

				if (!branchType) return

				const ticketNumber = await vscode.window.showInputBox({
					placeHolder: 'Enter ticket number (optional)',
					prompt: 'e.g., T-123'
				})

				const description = await vscode.window.showInputBox({
					placeHolder: 'Enter branch description',
					prompt: 'Use lowercase letters and hyphens, like this: my-cool-new-branch',
					validateInput: (value: string) => {
						if (!value) return 'Description is required'
						if (!/^[a-z0-9-]+$/.test(value)) {
							return 'Use only lowercase letters, numbers, and hyphens'
						}
						if (value.includes('--')) {
							return 'Avoid consecutive hyphens'
						}
						if (value.endsWith('-')) {
							return 'Branch name should not end with a hyphen'
						}

						return null
					}
				})

				if (!description) {
					return
				}

				const branchName = formatBranchName({
					prefix: branchType,
					ticketNumber,
					description
				})

				const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('No workspace folder found')
					return
				}

				const git = simpleGit(workspaceFolder.uri.fsPath)
				await git.checkoutLocalBranch(branchName)

				vscode.window.showInformationMessage(`Created and switched to branch: ${branchName}`)
			} catch (error) {
				vscode.window.showErrorMessage(
					`Error creating branch: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}
		})
	)
	let disposable = vscode.commands.registerCommand('git-ai.generateCommit', async () => {
		try {
			const diff = await getGitDiff()
			if (!diff) {
				vscode.window.showErrorMessage('No changes detected in git.')
				return
			}

			const message = await generateCommitMessage(diff)
			if (message) {
				const editor = vscode.window.activeTextEditor
				if (editor) {
					await vscode.commands.executeCommand('workbench.view.scm')
					await vscode.commands.executeCommand('git.stageAll')
					const scmInputBox = vscode.scm.inputBox
					if (scmInputBox) {
						scmInputBox.value = message
					}
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(
				`Error: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	})

	context.subscriptions.push(disposable)
}
