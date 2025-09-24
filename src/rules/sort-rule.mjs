import * as escodegen from 'escodegen';

/**
 * @typedef {import("eslint").Rule} ERule
 * */

/**
 * @typedef {import("estree").Program} EProgram
 */

/**
 * @typedef {import("estree").ExportAllDeclaration} EExportAllDeclaration
 * @typedef {import("estree").ExportNamedDeclaration} EExportNamedDeclaration
 * @typedef {import("estree").ExportDefaultDeclaration} EExportDefaultDeclaration
 * @typedef {EExportAllDeclaration | EExportNamedDeclaration | EExportDefaultDeclaration} ExportDeclaration
 * */

/**
 * @typedef {import("estree").ImportDeclaration} EImportDeclaration
 * @typedef {import("estree").ImportSpecifier} EImportSpecifier
 * @typedef {import("estree").ImportNamespaceSpecifier} EImportNamespaceSpecifier
 * @typedef {import("estree").ImportDefaultSpecifier} EImportDefaultSpecifier
 * */

/**
 * @typedef {Object} ImportGroups
 * @property {ImportDeclaration[]} starImports
 * @property {EImportDeclaration[]} defaultImports
 * @property {EImportDeclaration[]} namedImports
 */

/**
 * @param importNodes{EImportDeclaration[]}
 * @return ImportGroups
 * */
function groupImports(importNodes) {
  const /**EImportDeclaration[]*/ starImports = [];
  const /**EImportDeclaration[]*/ defaultImports = [];
  const /**EImportDeclaration[]*/ namedImports = [];

  importNodes.forEach((/**EImportDeclaration*/ node) => {
    if (
      node.specifiers.some(spec => spec.type === 'ImportNamespaceSpecifier')
    ) {
      starImports.push(node);
    } else if (
      node.specifiers.some(spec => spec.type === 'ImportDefaultSpecifier')
    ) {
      defaultImports.push(node);
    } else {
      namedImports.push(node);
    }
  });

  return { starImports, defaultImports, namedImports };
}

/**
 * @param spec{EImportSpecifier | EImportDefaultSpecifier | EImportNamespaceSpecifier}
 * @return string
 * */
function getSpecifierName(spec) {
  return spec.local.name;
}

/**
 * @param node{EImportDeclaration}
 * @return string
 * */
function getFirstSpecifierName(node) {
  if (node.specifiers.length > 0) {
    return getSpecifierName(node.specifiers[0]);
  }

  return '';
}

/**
 * @param node{EImportDeclaration}
 * @return string
 * */
function generateImportCode(node) {
  // check if ast node is of typescript type (TSESTree). maybe there is a better solution to recreate ts source from ast
  if (node.importKind === 'type') {
    const source = node.source.raw || `"${String(node.source.value)}"`;

    if (node.specifiers.length === 0) {
      return `import type ${source}`;
    }

    const specifierStrings = node.specifiers
      .map(spec => {
        if (spec.type === 'ImportDefaultSpecifier') {
          return spec.local.name;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          return `* as ${spec.local.name}`;
        } else {
          const imported =
            spec.imported.type === 'Identifier'
              ? spec.imported.name
              : 'default';
          return imported === spec.local.name
            ? imported
            : `${imported} as ${spec.local.name}`;
        }
      })
      .filter(s => s);

    return `import type { ${specifierStrings.join(', ')} } from ${source}`;
  }

  // For regular imports, use escodegen
  return escodegen.generate(node);
}

/**
 * @param groups{ImportGroups}
 * @return string
 * */
function formatImportsWithGroups(groups) {
  const importTextArr = [
    ...groups.starImports.map(node => generateImportCode(node)),
    ...groups.defaultImports.map(node => generateImportCode(node)),
    ...groups.namedImports.map(node => generateImportCode(node)),
  ];

  return importTextArr.join('\n');
}

/**
 * @param a{EImportDeclaration}
 * @param b{EImportDeclaration}
 * @return boolean
 * */
function areNodesEqual(a, b) {
  if (a.source.value !== b.source.value) {
    return false;
  }
  if (a.specifiers.length !== b.specifiers.length) {
    return false;
  }
  return a.specifiers.join(',') === b.specifiers.join(',');
}

/**
 * @param original{EImportDeclaration[]}
 * @param sorted{EImportDeclaration[]}
 * @return boolean
 * */
function areImportsEqual(original, sorted) {
  if (original.length !== sorted.length) {
    return false;
  }

  for (let i = 0; i < original.length; i++) {
    if (!areNodesEqual(original[i], sorted[i])) {
      return false;
    }
  }

  return true;
}

/**
 * @param groups{ImportGroups}
 * */
function sortImportGroups(groups) {
  // Specifiers inside are already sorted so only compare the first
  const sortBySpecifiers = (
    /**EImportDeclaration*/ a,
    /**EImportDeclaration*/ b,
  ) => {
    const aSpecifiers = getFirstSpecifierName(a);
    const bSpecifiers = getFirstSpecifierName(b);
    return aSpecifiers.localeCompare(bSpecifiers);
  };

  groups.starImports.sort(sortBySpecifiers);
  groups.defaultImports.sort(sortBySpecifiers);
  groups.namedImports.sort(sortBySpecifiers);
}

/**
 * @param context{ERule.RuleContext}
 * @param originalImports{EImportDeclaration[]}
 * @param groups{ImportGroups}
 * */
function checkAndFixImports(context, originalImports, groups) {
  const sortedImports = [
    ...groups.starImports,
    ...groups.defaultImports,
    ...groups.namedImports,
  ];

  const needsReordering = !areImportsEqual(originalImports, sortedImports);
  if (needsReordering) {
    const sortedTextWithGroups = formatImportsWithGroups(groups);

    context.report({
      node: originalImports[0],
      message:
        'Imports should be sorted alphabetically. Wildcard imports first. Default Imports second. Named Imports last.',
      fix(/**ERule.RuleFixer*/ fixer) {
        const startRange = originalImports[0].range[0];
        const endRange = originalImports[originalImports.length - 1].range[1];

        return fixer.replaceTextRange(
          [startRange, endRange],
          sortedTextWithGroups,
        );
      },
    });
  }
}

/**
 * @param specifiers{(EImportSpecifier | EImportDefaultSpecifier | EImportNamespaceSpecifier)[]}
 * @return {(EImportSpecifier | EImportDefaultSpecifier | EImportNamespaceSpecifier)[]}
 */
function sortSpecifiersInNode(specifiers) {
  return [...specifiers].sort((a, b) => {
    const aType = a.type;
    const bType = b.type;

    // Default Specifiers have to be first
    if (aType === 'ImportDefaultSpecifier') {
      return -1;
    }
    if (bType === 'ImportDefaultSpecifier') {
      return 1;
    }

    const aName = getSpecifierName(a);
    const bName = getSpecifierName(b);
    return aName.toLowerCase().localeCompare(bName.toLowerCase());
  });
}

export default {
  meta: {
    type: 'layout',
    docs: {
      description: 'Sort imports by specifier',
    },
    fixable: 'code',
  },

  create(/**ERule.RuleContext*/ context) {
    const /**EImportDeclaration[]*/ importNodes = [];
    const /**EImportDeclaration[]*/ importNodesSpecifierSorted = [];

    let isImportEndReached = false;
    let isImportDeclaredAfterwards = false;

    return {
      // Loop through each node and check for import. Stop if something else appears that is not import.
      Program(/**EProgram*/ node) {
        for (const stmt of node.body) {
          if (stmt.type === 'ImportDeclaration') {
            if (isImportEndReached) {
              context.report({
                node: stmt,
                message:
                  'Import declarations must not be declared after other declarations',
              });
              isImportDeclaredAfterwards = true;
              break;
            }

            importNodes.push(stmt);
            importNodesSpecifierSorted.push({
              ...stmt,
              specifiers: sortSpecifiersInNode(stmt.specifiers),
            });
          } else {
            isImportEndReached = true;
          }
        }
      },

      'Program:exit'() {
        if (importNodes.length === 0 || isImportDeclaredAfterwards) {
          return;
        }

        const importGroups = groupImports(importNodesSpecifierSorted);
        sortImportGroups(importGroups);

        checkAndFixImports(context, importNodes, importGroups);
      },
    };
  },
};
