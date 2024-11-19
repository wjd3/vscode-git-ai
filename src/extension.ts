// src/extension.ts
import * as vscode from 'vscode'
import { getGitDiff } from './utils/git'
import { generateCommitMessage } from './utils/ai'
import { generateBranchName } from './utils/branch'
import { simpleGit } from 'simple-git'

export function activate(context: vscode.ExtensionContext) {
	// Register commit message generation command
	const generateCommit = vscode.commands.registerCommand('git-ai.generateCommit', async () => {
		try {
			const diff = await getGitDiff()
			if (!diff) {
				vscode.window.showErrorMessage('No changes detected in git.')
				return
			}

			const commitDetails = await generateCommitMessage(diff)

			if (commitDetails) {
				await vscode.commands.executeCommand('workbench.view.scm')
				await vscode.commands.executeCommand('git.stageAll')

				// Get the SCM input box
				const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports
				const git = gitExtension.getAPI(1)

				if (!git || git.repositories.length === 0) {
					throw new Error('Git extension not found or no repositories')
				}

				const repository = git.repositories[0]

				// Set both the commit name and message
				repository.inputBox.value = commitDetails.message

				const nameInput = repository.repository.getCommitTemplate()
				if (nameInput) {
					repository.inputBox.value = `${commitDetails.name}\n\n${commitDetails.message}`
				} else {
					repository.inputBox.value = commitDetails.message
				}

				console.log(commitDetails)
			}
		} catch (error) {
			vscode.window.showErrorMessage(
				`Error: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	})

	// Register branch creation command
	const createBranch = vscode.commands.registerCommand('git-ai.createBranch', async () => {
		try {
			const useDescription = await vscode.window.showQuickPick(
				['Use description', 'Use current changes'],
				{
					placeHolder: 'How would you like to generate the branch name?'
				}
			)

			if (!useDescription) return

			let branchName: string

			if (useDescription === 'Use description') {
				const description = await vscode.window.showInputBox({
					placeHolder: 'Enter a description of the changes/feature',
					prompt: 'Describe what this branch will be used for'
				})

				if (!description) return
				branchName = await generateBranchName(description)
			} else {
				branchName = await generateBranchName()
			}

			// Create and checkout the branch
			const workspaceFolders = vscode.workspace.workspaceFolders
			if (!workspaceFolders) {
				throw new Error('No workspace folder open')
			}
			if (!workspaceFolders[0]) {
				throw new Error('No workspace folder open')
			}

			const git = simpleGit(workspaceFolders[0].uri.fsPath)
			await git.checkoutLocalBranch(branchName)

			vscode.window.showInformationMessage(`Created and switched to branch: ${branchName}`)
		} catch (error) {
			vscode.window.showErrorMessage(
				`Error: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	})

	// Register model selection command
	let changeModel = vscode.commands.registerCommand('git-ai.changeModel', async () => {
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

		if (!model) return

		if (model.label === currentModel) {
			vscode.window.showInformationMessage(`Model is already set to ${model.label}`)
			return
		}

		await config.update('preferredModel', model.label, vscode.ConfigurationTarget.Global)
		vscode.window.showInformationMessage(`Preferred model changed to ${model.label}`)
	})

	context.subscriptions.push(generateCommit, createBranch, changeModel)
}
