# lodash to [lodash-amd](https://github.com/lodash/lodash-amd) codemods

```
npm i
# Update _.forEach => forEach (in AMD module)
./node_modules/.bin/jscodeshift -t codemods/methods.js tests/methods.js
# Update _.chain().each() => chain().and(each) (in AMD module)
./node_modules/.bin/jscodeshift -t codemods/chain.js tests/chain.js
```
