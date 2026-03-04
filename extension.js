const vscode = require('vscode');
const { handleNewProject } = require('./src/commands/newProject');
const { handleAddComponent } = require('./src/commands/addComponent');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('MC Mod Utility is now active!');

    context.subscriptions.push(
        vscode.commands.registerCommand('mc-mod-utility.newProject', () => handleNewProject(context)),
        vscode.commands.registerCommand('mc-mod-utility.addComponent', () => handleAddComponent(context))
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
