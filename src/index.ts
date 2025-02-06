#!/usr/bin/env node
import {
   Project,
   SourceFile,
   CallExpression,
   Node,
   ParameterDeclaration,
} from 'ts-morph';

// Captura o diretório passado como argumento no terminal
const args = process.argv.slice(2); // Remove `node` e o script da lista de argumentos
const ROOT_DIR = args[0] || process.cwd(); // Se nenhum argumento for passado, usa o diretório atual

// Tipos de serviços que serão analisados
const SERVICE_TYPES = ['EtcdService', 'ConfigService'];
const ENV_VAR_USAGE = 'process.env';

const project = new Project();
project.addSourceFilesAtPaths([
   `${ROOT_DIR}/**/*.ts`,
   `${ROOT_DIR}/**/*.tsx`,
   `!${ROOT_DIR}/**/*.js`,
   `!${ROOT_DIR}/**/*.jsx`,
   `!${ROOT_DIR}/node_modules`,
   `!${ROOT_DIR}/dist`,
   `!${ROOT_DIR}/build`,
   `!${ROOT_DIR}/coverage`,
   `!${ROOT_DIR}/.next`,
   `!${ROOT_DIR}/.nuxt`,
   `!${ROOT_DIR}/.vscode`,
   `!${ROOT_DIR}/.git`,
]);

/**
 * Classe responsável por escanear configurações usadas no código.
 */
class ServiceUsageScanner {
   private usageReport: Set<string> = new Set();

   public scanProject(): void {
      project.getSourceFiles().forEach((sourceFile) => {
         if (this.usesService(sourceFile)) {
            this.scanFile(sourceFile);
         }
      });

      this.printResults();
   }

   private usesService(sourceFile: SourceFile): boolean {
      return sourceFile
         .getImportDeclarations()
         .some((imp) =>
            SERVICE_TYPES.some((service) => imp.getText().includes(service))
         );
   }

   private scanFile(sourceFile: SourceFile): void {
      sourceFile.forEachDescendant((node) => {
         if (Node.isCallExpression(node)) {
            this.checkServiceCall(node);
         }

         if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
            this.scanFunctionParameters(node, sourceFile);
         }
      });

      this.scanForProcessEnv(sourceFile);
   }

   private checkServiceCall(callExpr: CallExpression): void {
      const expressionText = callExpr.getExpression().getText();

      if (expressionText.includes('app.get')) {
         return;
      }

      if (
         expressionText.endsWith('.get') ||
         expressionText.endsWith('.getOrThrow')
      ) {
         this.addToReport(callExpr);
      }
   }

   private scanFunctionParameters(node: Node, sourceFile: SourceFile): void {
      node.forEachChild((child) => {
         if (child instanceof ParameterDeclaration) {
            const paramName = child.getName();
            this.scanFileForParameterUsage(paramName, sourceFile);
         }
      });
   }

   private scanFileForParameterUsage(
      paramName: string,
      sourceFile: SourceFile
   ): void {
      sourceFile.forEachDescendant((node) => {
         if (Node.isCallExpression(node)) {
            const expressionText = node.getExpression().getText();

            if (
               expressionText === `${paramName}.get` ||
               expressionText === `${paramName}.getOrThrow`
            ) {
               this.addToReport(node);
            }
         }
      });
   }

   private scanForProcessEnv(sourceFile: SourceFile): void {
      sourceFile.forEachDescendant((node) => {
         if (Node.isPropertyAccessExpression(node)) {
            const expressionText = node.getExpression().getText();

            if (expressionText === ENV_VAR_USAGE) {
               const envVarName = node.getName();
               this.usageReport.add(`process.env.${envVarName}`);
            }
         }
      });
   }

   private addToReport(callExpr: CallExpression): void {
      const args = callExpr.getArguments();

      args.forEach((arg) => {
         if (Node.isStringLiteral(arg)) {
            this.usageReport.add(arg.getLiteralValue());
         }
      });
   }

   private printResults(): void {
      console.clear();
      console.log(
         '🔎 Pesquisando todas as configurações usadas no projeto:',
         '\x1b[33m',
         ROOT_DIR,
         '\x1b[0m'
      );
      console.log(
         '\n📌 Configurações encontradas:\n',
         Array.from(this.usageReport).sort()
      );
   }
}

// Inicia a análise do projeto
new ServiceUsageScanner().scanProject();
