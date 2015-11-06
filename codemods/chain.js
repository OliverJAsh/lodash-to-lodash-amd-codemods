// http://astexplorer.net/#/dVm0cJ0cZh/44

const lodashMaps = require('../lodash-maps');

module.exports = function (file, api) {
    const j = api.jscodeshift;

    const isMemberExpression = function (node) {
        return node.type === 'MemberExpression';
    };
    const isIdentifier = function (node) {
        return node.type === 'Identifier';
    };
    const isCallExpression = function (node) {
        return node.type === 'CallExpression';
    };
    const isLodashChainCallExpression = function (node) {
        if (isCallExpression(node)) {
            const callee = node.callee;
            if (isMemberExpression(callee)) {
                return callee.object.name === '_'
                    && callee.property.name === 'chain';
            } else if (isIdentifier(callee)) {
                return callee.name === '_';
            } else {
                return false;
            }
        } else {
            return false;
        }
    };

    const contains = (array, value) => array.some(x => x === value);
    const head = x => x[0];
    const identity = x => x;
    const unique = x => x.reduce((acc, s) => {
        if (acc.indexOf(s) === -1) {
            acc.push(s);
        }
        return acc;
    }, []);
    const mapObject = (object, mapFn) =>
        Object.keys(object).map(key => mapFn(object[key], key));
    const values = object => mapObject(object, value => value);

    const getDeepestCallExpression = callExpression => {
        const traverse = currentCallExpression => {
            const callee = currentCallExpression.callee;
            if (isMemberExpression(callee) && isCallExpression(callee.object)) {
                return traverse(callee.object);
            } else {
                return currentCallExpression;
            }
        };

        return traverse(callExpression);
    };

    // Find the outer call expression for a given chain, i.e. _.chain().x().y().value()
    const getOuterChainCallExpressions = (ast) => (
        ast
            .find(j.CallExpression, callExpression => {
                // Traverse this call expression to see if it contains a call to _.chain
                const deepestCallExpression = getDeepestCallExpression(callExpression);
                return isLodashChainCallExpression(deepestCallExpression);
            })
    );

    const isChain = name => name === 'chain' || name === '_';

    const { lodashModuleMap, lodashAliasesMap } = lodashMaps;
    const getDirectProperty = (object, key) => {
        if (object.hasOwnProperty(key)) {
            return object[key];
        }
    };

    const getLodashModulePath = moduleName =>
        'lodash/' + getDirectProperty(lodashModuleMap, moduleName);
    const normalizeLodashModuleName = name => {
        const canonicalName = getDirectProperty(lodashAliasesMap, name) || name;
        if (getLodashModulePath(name)) {
            return canonicalName;
        }
    };

    const isLodashModule = name => !!normalizeLodashModuleName(name);
    const isChainMethod = name => contains([
        'value',
        'valueOf',

        // Array helpers
        'concat',
        'join',
        'pop',
        'push',
        'reverse',
        'shift',
        'slice',
        'sort',
        'splice',
        'unshift'
    ], name);

    const reverseCollection = collection => j(collection.paths().reverse());

    const replaceOuterChainCallExpressions = (outerChainCallExpressions) => {
        reverseCollection(outerChainCallExpressions).replaceWith(callExpressionPath => {
            const callExpression = callExpressionPath.node;
            const callee = callExpression.callee;

            const fnName = isMemberExpression(callee) ? callee.property.name : callee.name;
            const args = callExpression.arguments;

            // TODO: How to retain comments/indentation? https://github.com/facebook/jscodeshift/issues/67

            // Guard against _.chain().chain()
            if (isChain(fnName) && !(isMemberExpression(callee) && isCallExpression(callee.object))) {
                return j.callExpression(j.identifier('chain'), args);
            } else {
                if (isLodashModule(fnName)) {
                    return j.callExpression(
                        j.memberExpression(
                            callee.object,
                            j.identifier('and')
                        ),
                        [j.identifier(normalizeLodashModuleName(fnName))].concat(args)
                    );
                } else {
                    return j.callExpression(
                        j.memberExpression(
                            callee.object,
                            j.identifier(fnName)
                        ),
                        args
                    );
                }
            }
        });
    };

    const updateModuleDefinition = function (defineAst, modules) {
        // Update Lodash references
        defineAst
            .replaceWith(defineCallExpressionPath => {
                const firstArg = defineCallExpressionPath.node.arguments[0];
                const hasDepsArray = firstArg.type === 'ArrayExpression';

                if (hasDepsArray) {
                    // Add new deps
                    const depsArray = hasDepsArray ? firstArg : [];

                    // New define deps and params: replace the old Lodash reference with
                    // the new Lodash modules
                    const deps = hasDepsArray && unique(
                        depsArray.elements
                            .map(literal => literal.value)
                            .concat(values(modules))
                    ).map(s => j.literal(s));

                    const moduleDefinition = defineCallExpressionPath.node.arguments[hasDepsArray ? 1 : 0];
                    const oldParams = moduleDefinition.params;
                    const params = unique(
                        oldParams
                            .map(identifier => identifier.name)
                            .concat(Object.keys(modules))
                    ).map(s => j.identifier(s));

                    return j.callExpression(j.identifier('define'), [
                        hasDepsArray && j.arrayExpression(deps),
                        // If there is no ID, use an empty identifier to create spacing
                        j.functionExpression(moduleDefinition.id || j.identifier(''), params, moduleDefinition.body)
                    ].filter(identity));
                } else {
                    return defineCallExpressionPath.node;
                }
            });
    };

    const ast = j(file.source);

    const defineCallExpressions = ast
        .find(j.CallExpression, callExpression => callExpression.callee.name === 'define');

    defineCallExpressions.forEach(defineCallExpressionPath => {
        const defineAst = j(defineCallExpressionPath);
        const outerChainCallExpressions = getOuterChainCallExpressions(defineAst);

        // We must get these before mutating
        const potentialLodashModuleNames = unique(
            outerChainCallExpressions
                .nodes()
                .map(callExpression => {
                    const callee = callExpression.callee;
                    return isMemberExpression(callee) ? callee.property.name : callee.name;
                })
        );

        replaceOuterChainCallExpressions(outerChainCallExpressions);

        const nonChainableLodashMethods =
            ['clone', 'cloneDeep', 'contains', 'escape', 'every', 'find', 'findIndex',
            'findKey', 'findLast', 'findLastIndex', 'findLastKey', 'has', 'identity',
            'indexOf', 'isArguments', 'isArray', 'isBoolean', 'isDate', 'isElement',
            'isEmpty', 'isEqual', 'isFinite', 'isFunction', 'isNaN', 'isNull', 'isNumber',
            'isObject', 'isPlainObject', 'isRegExp', 'isString', 'isUndefined', 'join',
            'lastIndexOf', 'mixin', 'noConflict', 'parseInt', 'pop', 'random', 'reduce',
            'reduceRight', 'result', 'shift', 'size', 'some', 'sortedIndex', 'runInContext',
            'template', 'unescape', 'uniqueId', 'value'];
        const maybeNonChainableLodashMethods = ['first', 'last'];
        const isNonChainableLodashMethod = name => contains(nonChainableLodashMethods, name);
        const isMaybeNonChainableLodashMethod = name => contains(maybeNonChainableLodashMethods, name);

        potentialLodashModuleNames.forEach(fnName => {
            if (!isLodashModule(fnName) && !isChainMethod(fnName) && !isChain(fnName)) {
                console.log(file.path, 'Warning: no Lodash function or chain method for:', fnName);
            }

            if (isNonChainableLodashMethod(fnName)) {
                console.log(file.path, 'Warning: non chainable Lodash method:', fnName);
            }

            if (isMaybeNonChainableLodashMethod(fnName)) {
                console.log(file.path, 'Warning: maybe non chainable Lodash method:', fnName);
            }
        });

        const modulesToModuleMap = modules =>
            modules.reduce((map, moduleName) => {
                const canonicalModuleName = normalizeLodashModuleName(moduleName);
                if (isChain(moduleName)) {
                    map[moduleName] = 'common/utils/chain';
                } else {
                    map[canonicalModuleName] = getLodashModulePath(canonicalModuleName);
                }
                return map;
            }, {});
        const moduleNames = modulesToModuleMap(
            potentialLodashModuleNames
                .filter(fnName => isLodashModule(fnName) || isChain(fnName))
        );

        // console.log(file.path, 'Lodash module names:', lodashModuleNames);
        updateModuleDefinition(defineAst, moduleNames);
    });

    // https://github.com/benjamn/recast/blob/52a7ec3eaaa37e78436841ed8afc948033a86252/lib/options.js#L61
    return ast.toSource({
        quote: 'single'
        // This prevents recast from changing our indentation
        // wrapColumn: 1
    });
};
