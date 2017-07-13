import {
  commands,
  ExtensionContext,
  QuickPickItem,
  QuickPickOptions,
  TextEditor,
  TextEditorEdit,
  window,
  workspace,
  Position
} from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import * as Q from 'q';

export interface NewFileSettings {
  rootDirectory: string,
  templateDirectory: string,
  templateNames: string,
  methodTemplate: string
}

export class MethodController {
  private settings: NewFileSettings;
  private rootPath: string;

  private readFile(src: string): string {
    return fs.readFileSync(src, 'utf-8');
  }

  private replace(src: string, value: string, keyword: string): string {
    let find = `\\[\\[${keyword}\\]\\]`;
    var re = new RegExp(find, 'g');

    return src.replace(re, value);
  }

  private writeFile(fileName: string, data: string) {
    fs.writeFileSync(fileName, data, 'utf-8');
  }

  public readSettings(): MethodController {
    let config = workspace.getConfiguration('newMethod');

    this.settings = {
      rootDirectory: config.get('rootDirectory', this.homedir()),
      templateDirectory: config.get('templateDirectory', 'template'),
      templateNames: config.get('templateNames', ''),
      methodTemplate: config.get('methodTemplate', '')
    };

    return this;
  }

  public determineRoot(): Q.Promise<string> {
    let root = this.settings.rootDirectory;

    if (root.indexOf('~') === 0) {
      root = path.join(this.homedir(), root.substr(1));
    }

    this.rootPath = root;

    return Q(root);
  }

  public showMethodSignatureDialog(): Q.Promise<string> {
    const deferred: Q.Deferred<string> = Q.defer<string>();
    let question = `What is the new method signature?`;

    window.showInputBox({
      prompt: question,
      value: ''
    }).then(methodSignature => {
      if (methodSignature === null || typeof methodSignature === 'undefined') {
        deferred.reject(undefined);
        return;
      }

      deferred.resolve(methodSignature);
    });

    return deferred.promise;
  }

  public addToCurrentLocation(methodSignature: string): Q.Promise<string> {
    const deferred: Q.Deferred<string> = Q.defer<string>();

    if (window.activeTextEditor) {
      window.activeTextEditor.edit(builder => {
        let currentLine = window.activeTextEditor.selection.active
        builder.insert(currentLine, `${methodSignature}`)

        this.insertMethodTemplate(builder, currentLine, methodSignature);

        deferred.resolve(methodSignature);
      });
    } else {
      deferred.reject('no selected file');
      return;
    }

    return deferred.promise;
  }

  public createMethods(methodSignature: string): Q.Promise<string[]> {
    const fileNames = this.settings.templateNames.split(',');
    const fileCreationPromises: Q.Promise<string>[] = fileNames.map((fileName) => this.createMethod(fileName, methodSignature));
    return Q.all(fileCreationPromises);
  }

  public createMethod(fileName: string, methodSignature: string): Q.Promise<string> {
    const deferred: Q.Deferred<string> = Q.defer<string>();

    //rootpath is to thinkovator.com
    //file name is instrumenting.go

    if (!window.activeTextEditor) {
      deferred.reject('no selected file');
      return;
    }

    let templatePath = path.join(this.rootPath, this.settings.templateDirectory, `${fileName}.tmpl`);
    let template = this.readFile(templatePath);

    let currentDirectory = path.dirname(window.activeTextEditor.document.fileName);
    let filePath = path.join(currentDirectory, fileName);
    
    let file = this.readFile(filePath);
    
    let methodSignatureReplaced = this.replaceMethodSignature(template, methodSignature);
    let methodNameReplaced = this.replaceMethodName(methodSignatureReplaced, methodSignature);
    let parametersReplaced = this.replaceParameters(methodNameReplaced, methodSignature);
    let loggingIdReplaced = this.replaceLoggingId(parametersReplaced, methodSignature);
    let methodNameWithoutReturnReplaced = this.replaceMethodSignatureWithoutReturn(loggingIdReplaced, methodSignature);
    let nameReturnReplaced = this.replaceNamedReturn(methodNameWithoutReturnReplaced, methodSignature);

    let mergedFile = `${file}\n${nameReturnReplaced}`;


    this.writeFile(filePath, mergedFile);

    deferred.resolve(methodSignature);
    return;
  }

  private replaceMethodSignature(template: string, methodSignature: string): string {
    const MethodSignature = 'METHODSIGNATURE';
    if(template.indexOf(MethodSignature) === -1){
      return template;
    }

    let notationRemoved = methodSignature.split('`')[0].trim();
    return this.replace(template, notationRemoved, MethodSignature);
  }

  private replaceMethodName(template: string, methodSignature: string): string {
    const MethodName = 'METHODNAME';
    if(template.indexOf(MethodName) === -1){
      return template;
    }


    let methodName = methodSignature.split('(')[0].trim();
    return this.replace(template, methodName, MethodName);
  }

  private replaceParameters(template: string, methodSignature: string): string {
    const Parameters = 'PARAMETERS';
    if(template.indexOf(Parameters) === -1){
      return template;
    }

    let destructedSignature = methodSignature.split('(');
    if(destructedSignature.length > 1) {
      let parametersWithType = destructedSignature[1].split(')')[0].split(',');
      let parameterNames = [];
      for (var i = 0; i < parametersWithType.length; i++) {
        var element = parametersWithType[i];
        parameterNames.push(element.trim().split(' ')[0]);
      }

      return this.replace(template, parameterNames.join(', '), Parameters);
    }
    return template;
  }

  private replaceMethodSignatureWithoutReturn(template: string, methodSignature: string): string {
    const MethodSignatureWithoutReturn = 'METHODSIGNATUREWITHOUTRETURN';
    if(template.indexOf(MethodSignatureWithoutReturn) === -1){
      return template;
    }

    let methodWithoutReturn = methodSignature.split(')');
    if(methodWithoutReturn.length > 1) {
      return this.replace(template, methodWithoutReturn[0].trim() + ')', MethodSignatureWithoutReturn)
    }
    return template;
  }

  private replaceNamedReturn(template:string, methodSignature: string): string {
    const NamedReturn = 'NAMEDRETURN';
    if(template.indexOf(NamedReturn) === -1){
      return template;
    }

    let destructedSignature = methodSignature.split(')');
    if(destructedSignature.length > 1) {
      let returnTypes = destructedSignature[1].split('(')[1].split(')')[0].split(',');
      let namedReturnTypes = [];
      for (var i = 0; i < returnTypes.length; i++) {
        var element = returnTypes[i].trim();
        
        var elementName = element.replace('*', '').toLowerCase().slice(0, 1);
        
        namedReturnTypes.push(`${elementName} ${element}`)
      }
      return this.replace(template, `(${namedReturnTypes.join(', ')})`, NamedReturn);
    }

    return template;
  }
  
  private replaceLoggingId(template: string, methodSignature: string): string {
    const LoggingId = 'LOGGINGID';
    if(template.indexOf(LoggingId) === -1){
      return template;
    }

    let destructedSignature = methodSignature.split('(');
    if(destructedSignature.length > 1) {
      let parametersWithType = destructedSignature[1].split(')')[0].split(',');
      let parameterNames = [];
      for (var i = 0; i < parametersWithType.length; i++) {
        var element = parametersWithType[i];
        if(element === '') {
          element = '\"undefined\"';
        }
        parameterNames.push(element.trim().split(' ')[0]);
      }

      return this.replace(template, parameterNames[0], LoggingId);
    }

    return template;
  }

  private insertMethodTemplate(builder: TextEditorEdit, currentLine: Position, methodSignature: string) {
    let templatePath = path.join(this.rootPath, this.settings.templateDirectory, this.settings.methodTemplate);
    let template = this.readFile(templatePath);

    let signatureWithoutNotation = methodSignature.split('`')[0];
    let transformedContent = this.replace(template, signatureWithoutNotation, 'REPLACE');

    let newPosition = new Position(currentLine.line + 2, 0);
    builder.insert(newPosition, transformedContent);
  }

  private homedir(): string {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
  }
}
