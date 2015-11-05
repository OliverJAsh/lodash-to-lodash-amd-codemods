/* eslint-disable */
// jscs:disable
define([
  'foo',
  "common/utils/_",
  'bar'
], function(foo, _, bar) {
  var x = _.chain([]).map(foo);

  // TODO: Fix?
  x.filter();
  // http://astexplorer.net/#/f2UWCOpcxp/5
  // Should become x.and(filter);

  var y = 'foo';
  y = _.chain([]).map(foo);

  // TODO: Fix?
  y.filter();
  // Should become x.and(filter);

  _.chain().value()

  foo(_.chain([]).value());

  _.foo()

  _([]).map(x).value().sort();

  _.chain([]).join(',');

  _.chain([]).each();

  _.chain([])
    .join(',') // foo
    .value();

    // last returns unwrapped when n is not provided
  _.chain([]).last();

  _([]).reduce().last();
});

define(['foo'], function (foo) {});

define(function () {});

define({});
