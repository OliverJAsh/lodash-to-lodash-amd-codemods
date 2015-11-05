// http://astexplorer.net/#/rBTutLKkyR/15

const lodashMaps = require('../lodash-maps');

module.exports = function (file, api) {
    const j = api.jscodeshift;

    const identity = x => x;
    const unique = x => x.reduce((acc, s) => {
        if (acc.indexOf(s) === -1) {
            acc.push(s);
        }
        return acc;
    }, []);

    const oldDependencyName = 'common/utils/_';
    const newDependencyNamePrefix = 'lodash/';
    const oldParamName = '_';

    const { lodashModuleMap, lodashAliasesMap } = lodashMaps;
    const getDirectProperty = (object, key) => {
        if (object.hasOwnProperty(key)) {
            return object[key];
        }
    };
    const normalizeLodashMethod = name => {
        const canonicalModuleName = getDirectProperty(lodashAliasesMap, name) || name;
        return getDirectProperty(lodashModuleMap, canonicalModuleName);
    }
    const normalizeModulePath = name =>
        newDependencyNamePrefix + normalizeLodashMethod(name);
    const normalizeModuleName = name => normalizeModulePath(name).split('/').pop();

    const updateModuleDefinition = function (defineAst, lodashModuleNames) {
        // Update Lodash references
        defineAst
            .replaceWith(defineCallExpressionPath => {
                const firstArg = defineCallExpressionPath.node.arguments[0];
                const hasDepsArray = firstArg.type === 'ArrayExpression';
                const depsArray = hasDepsArray ? firstArg : [];

                // New define deps and params: replace the old Lodash reference with
                // the new Lodash modules
                const deps = hasDepsArray && unique(
                    depsArray.elements
                        .map(literal => literal.value)
                        .filter(value => value !== oldDependencyName)
                        .concat(lodashModuleNames.map(normalizeModulePath))
                ).map(s => j.literal(s));

                const moduleDefinition = defineCallExpressionPath.node.arguments[hasDepsArray ? 1 : 0];
                const oldParams = moduleDefinition.params;
                const params = unique(
                    oldParams
                        .map(identifier => identifier.name)
                        .filter(name => name !== oldParamName)
                        .concat(lodashModuleNames.map(normalizeModuleName))
                ).map(s => j.identifier(s));

                return j.callExpression(j.identifier('define'), [
                    hasDepsArray && j.arrayExpression(deps),
                    // If there is no ID, use an empty identifier to create spacing
                    j.functionExpression(moduleDefinition.id || j.identifier(''), params, moduleDefinition.body)
                ].filter(identity));
            });
    };

    const ast = j(file.source);

    const defineCallExpressions = ast
        .find(j.CallExpression, callExpression => callExpression.callee.name === 'define');

    defineCallExpressions.forEach(defineCallExpressionPath => {
        const defineAst = j(defineCallExpressionPath);

        const lodashCalls = defineAst
            .find(j.MemberExpression, memberExpression => memberExpression.object.name === '_')
            // Chain is handled by a separate codemod
            .filter(nodePath => nodePath.node.property.name !== 'chain');

        const lodashModuleNames = unique(
            lodashCalls
                .nodes()
                .map(p => p.property.name)
        );

        if (lodashModuleNames.length) {
            updateModuleDefinition(defineAst, lodashModuleNames);

            // Update Lodash usages
            // We normalize the name for consistency
            lodashCalls
                .replaceWith(memberExpression => j.identifier(normalizeModuleName(memberExpression.value.property.name)));
        }
    });


    // https://github.com/benjamn/recast/blob/52a7ec3eaaa37e78436841ed8afc948033a86252/lib/options.js#L61
    return ast.toSource({
        quote: 'single',
        // This prevents recast from changing our indentation
        wrapColumn: 1
    });
};
