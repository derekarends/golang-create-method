'use strict';
import {
  commands,
  ExtensionContext,
  window
} from 'vscode'

import { MethodController } from './method-controller';

export function activate(context: ExtensionContext) {
  let disposable = commands.registerCommand('golang.createNewMethod', () => {

    const Controller = new MethodController().readSettings();

    Controller.determineRoot()
      .then(root => Controller.showMethodSignatureDialog())
      .then(methodSignature => Controller.addToCurrentLocation(methodSignature))
      .then(methodSignature => Controller.createMethods(methodSignature))
      .catch((err) => {
        if (err.message) {
          window.showErrorMessage(err.message);
        }
      });
  });

  context.subscriptions.push(disposable);
}